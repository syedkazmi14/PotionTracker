"""
Scheduling system to create daily courier assignments.
Minimizes number of couriers needed while preventing overflow.
"""
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from utils.forecasting import get_forecast
from utils.route_optimization import (
    fetch_network_data, build_graph, optimize_courier_route
)
import requests

def fetch_cauldrons() -> List[Dict]:
    """Fetch cauldron information."""
    try:
        response = requests.get('https://hackutd2025.eog.systems/api/Information/cauldrons')
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error fetching cauldrons: {e}")
        return []


def fetch_couriers() -> List[Dict]:
    """Fetch courier information."""
    try:
        response = requests.get('https://hackutd2025.eog.systems/api/Information/couriers')
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error fetching couriers: {e}")
        return []


def fetch_market() -> Dict:
    """Fetch market information."""
    try:
        response = requests.get('https://hackutd2025.eog.systems/api/Information/market')
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error fetching market: {e}")
        return {}


def identify_pickup_needs(forecasts: List[Dict], target_date: datetime, threshold_percent: float = 80.0) -> List[Dict]:
    """
    Identify which cauldrons need pickups on a specific date.
    A cauldron needs pickup if it is at or above threshold_percent OR will reach it on or before target_date.
    Returns list of {cauldron_id, urgency, volume_to_collect, deadline}.
    """
    pickup_needs = []
    target_date_end = target_date.replace(hour=23, minute=59, second=59)
    current_time = datetime.now()
    
    for forecast in forecasts:
        cauldron_id = forecast['cauldron_id']
        current_level = forecast['current_level']
        max_volume = forecast['max_volume']
        brew_rate = forecast['brew_rate_liters_per_hour']
        current_percentage = forecast.get('current_percentage', (current_level / max_volume * 100) if max_volume > 0 else 0)
        time_to_80 = forecast.get('time_to_80_percent')
        
        # Check if already at or above threshold - always needs pickup
        if current_percentage >= threshold_percent:
            # Already at threshold, needs immediate pickup
            volume_to_collect = min(current_level, max_volume * (threshold_percent / 100))
            pickup_needs.append({
                'cauldron_id': cauldron_id,
                'urgency': -1,  # Most urgent (negative = already past threshold)
                'volume_to_collect': volume_to_collect,
                'deadline': current_time.isoformat(),
                'current_level': current_level,
                'max_volume': max_volume
            })
            continue
        
        # If not at threshold yet, check if it will reach it on or before target date
        if time_to_80:
            try:
                threshold_time = datetime.fromisoformat(time_to_80.replace('Z', '+00:00'))
                
                # If threshold is reached on or before target date, schedule pickup
                if threshold_time <= target_date_end:
                    # Calculate volume that will be at threshold time
                    if brew_rate > 0:
                        hours_until_threshold = (threshold_time - current_time).total_seconds() / 3600
                        volume_at_threshold = current_level + (brew_rate * max(0, hours_until_threshold))
                    else:
                        volume_at_threshold = current_level
                    
                    # Collect 80% of max volume (or what's available)
                    volume_to_collect = min(volume_at_threshold, max_volume * (threshold_percent / 100))
                    
                    # Urgency: hours until threshold (negative if already past)
                    urgency = (threshold_time - current_time).total_seconds() / 3600
                    
                    pickup_needs.append({
                        'cauldron_id': cauldron_id,
                        'urgency': urgency,
                        'volume_to_collect': volume_to_collect,
                        'deadline': threshold_time.isoformat(),
                        'current_level': current_level,
                        'max_volume': max_volume
                    })
            except Exception as e:
                print(f"[Schedule] Error parsing time_to_80 for {cauldron_id}: {e}")
                continue
    
    # Sort by urgency (most urgent first - negative values first)
    pickup_needs.sort(key=lambda x: x['urgency'])
    return pickup_needs


def create_daily_schedule(date: Optional[str] = None) -> Dict:
    """
    Create daily schedule for couriers.
    Minimizes number of couriers needed (prefers one courier if possible).
    Uses 100L capacity and 80% threshold.
    """
    if date is None:
        date = datetime.now().strftime('%Y-%m-%d')
    
    # Parse target date
    try:
        target_date = datetime.strptime(date, '%Y-%m-%d')
    except:
        target_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Ensure target_date is at start of day for proper comparison
    target_date = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Fetch all required data
    cauldrons = fetch_cauldrons()
    couriers = fetch_couriers()
    market = fetch_market()
    network_data = fetch_network_data()
    
    if not cauldrons or not market:
        return {
            'date': date,
            'couriers_needed': 0,
            'assignments': [],
            'total_distance_km': 0.0
        }
    
    # Build graph
    graph = build_graph(network_data, cauldrons, market)
    
    # Get forecasts
    cauldron_info = {c['id']: c for c in cauldrons}
    forecasts = get_forecast(cauldron_info)
    
    # Identify pickup needs for this date (80% threshold)
    pickup_needs = identify_pickup_needs(forecasts, target_date, threshold_percent=80.0)
    
    print(f"[Schedule] Date: {date}, Found {len(pickup_needs)} cauldrons needing pickups")
    for pickup in pickup_needs:
        print(f"[Schedule]   - {pickup['cauldron_id']}: {pickup['volume_to_collect']:.2f}L, urgency: {pickup['urgency']:.2f}")
    
    if not pickup_needs:
        return {
            'date': date,
            'couriers_needed': 0,
            'assignments': [],
            'total_distance_km': 0.0
        }
    
    # Fixed courier capacity: 100L
    COURIER_CAPACITY = 100.0
    
    # Try to use one courier first (optimize route for all cauldrons)
    assignments = []
    remaining_pickups = pickup_needs.copy()
    
    # Calculate total volume needed
    total_volume_needed = sum(p['volume_to_collect'] for p in pickup_needs)
    
    # If total volume fits in one courier, try to optimize route for all
    if total_volume_needed <= COURIER_CAPACITY:
        all_cauldrons = [p['cauldron_id'] for p in pickup_needs]
        all_volumes = {p['cauldron_id']: p['volume_to_collect'] for p in pickup_needs}
        
        route, travel_time, total_distance, collected_volume = optimize_courier_route(
            graph, all_cauldrons, COURIER_CAPACITY, all_volumes
        )
        
        # Calculate start and end times
        stop_time = len(all_cauldrons) * 15  # 15 minutes per stop
        total_time_minutes = travel_time + stop_time
        
        start_time = target_date.replace(hour=8, minute=0, second=0, microsecond=0)
        if start_time < datetime.now():
            start_time = datetime.now()
        
        end_time = start_time + timedelta(minutes=total_time_minutes)
        
        assignments.append({
            'courier': 'Courier 1',
            'courier_id': 'courier_1',
            'route': route,
            'cauldrons_visited': all_cauldrons,
            'start': start_time.strftime('%H:%M'),
            'end': end_time.strftime('%H:%M'),
            'travel_time_minutes': travel_time,
            'total_time_minutes': total_time_minutes,
            'volume_collected': collected_volume,
            'distance_km': total_distance
        })
        remaining_pickups = []
    else:
        # Need multiple couriers - use greedy algorithm
        courier_index = 1
        
        while remaining_pickups:
            # Select cauldrons for this courier
            selected_cauldrons = []
            selected_volumes = {}
            total_volume = 0.0
            
            for pickup in remaining_pickups:
                if total_volume + pickup['volume_to_collect'] <= COURIER_CAPACITY:
                    selected_cauldrons.append(pickup['cauldron_id'])
                    selected_volumes[pickup['cauldron_id']] = pickup['volume_to_collect']
                    total_volume += pickup['volume_to_collect']
            
            if not selected_cauldrons:
                # Can't assign any more pickups
                break
            
            # Optimize route for selected cauldrons
            route, travel_time, distance, collected_volume = optimize_courier_route(
                graph, selected_cauldrons, COURIER_CAPACITY, selected_volumes
            )
            
            # Calculate start and end times
            stop_time = len(selected_cauldrons) * 15  # minutes
            total_time_minutes = travel_time + stop_time
            
            start_time = target_date.replace(hour=8, minute=0, second=0, microsecond=0)
            if start_time < datetime.now():
                start_time = datetime.now()
            
            end_time = start_time + timedelta(minutes=total_time_minutes)
            
            assignments.append({
                'courier': f'Courier {courier_index}',
                'courier_id': f'courier_{courier_index}',
                'route': route,
                'cauldrons_visited': selected_cauldrons,
                'start': start_time.strftime('%H:%M'),
                'end': end_time.strftime('%H:%M'),
                'travel_time_minutes': travel_time,
                'total_time_minutes': total_time_minutes,
                'volume_collected': collected_volume,
                'distance_km': distance
            })
            
            # Remove assigned pickups
            remaining_pickups = [p for p in remaining_pickups 
                               if p['cauldron_id'] not in selected_cauldrons]
            
            courier_index += 1
    
    # Calculate total distance
    total_distance = sum(a.get('distance_km', 0.0) for a in assignments)
    
    return {
        'date': date,
        'couriers_needed': len(assignments),
        'assignments': assignments,
        'unassigned_pickups': len(remaining_pickups),
        'total_distance_km': total_distance
    }

