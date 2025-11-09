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


def identify_pickup_needs(forecasts: List[Dict], hours_ahead: int = 24) -> List[Dict]:
    """
    Identify which cauldrons need pickups in the next N hours.
    Returns list of {cauldron_id, urgency, volume_to_collect, deadline}.
    """
    pickup_needs = []
    current_time = datetime.now()
    cutoff_time = current_time + timedelta(hours=hours_ahead)
    
    for forecast in forecasts:
        cauldron_id = forecast['cauldron_id']
        current_level = forecast['current_level']
        max_volume = forecast['max_volume']
        brew_rate = forecast['brew_rate_liters_per_hour']
        time_to_100 = forecast.get('time_to_100_percent')
        
        if not time_to_100:
            continue
        
        overflow_time = datetime.fromisoformat(time_to_100.replace('Z', '+00:00'))
        
        # If overflow is within the time window, schedule pickup
        if overflow_time <= cutoff_time:
            # Calculate volume that will accumulate
            hours_until_overflow = (overflow_time - current_time).total_seconds() / 3600
            volume_to_collect = current_level + (brew_rate * hours_until_overflow)
            volume_to_collect = min(volume_to_collect, max_volume)
            
            # Urgency: hours until overflow
            urgency = hours_until_overflow
            
            pickup_needs.append({
                'cauldron_id': cauldron_id,
                'urgency': urgency,
                'volume_to_collect': volume_to_collect,
                'deadline': overflow_time.isoformat(),
                'current_level': current_level,
                'max_volume': max_volume
            })
    
    # Sort by urgency (most urgent first)
    pickup_needs.sort(key=lambda x: x['urgency'])
    return pickup_needs


def create_daily_schedule(date: Optional[str] = None) -> Dict:
    """
    Create daily schedule for couriers.
    Minimizes number of couriers needed.
    """
    if date is None:
        date = datetime.now().strftime('%Y-%m-%d')
    
    # Fetch all required data
    cauldrons = fetch_cauldrons()
    couriers = fetch_couriers()
    market = fetch_market()
    network_data = fetch_network_data()
    
    if not cauldrons or not couriers or not market:
        return {
            'date': date,
            'couriers_needed': 0,
            'assignments': []
        }
    
    # Build graph
    graph = build_graph(network_data, cauldrons, market)
    
    # Get forecasts
    cauldron_info = {c['id']: c for c in cauldrons}
    forecasts = get_forecast(cauldron_info)
    
    # Identify pickup needs
    pickup_needs = identify_pickup_needs(forecasts, hours_ahead=24)
    
    if not pickup_needs:
        return {
            'date': date,
            'couriers_needed': 0,
            'assignments': []
        }
    
    # Create assignments using greedy algorithm
    assignments = []
    remaining_pickups = pickup_needs.copy()
    courier_index = 0
    
    # Sort couriers by capacity (largest first)
    sorted_couriers = sorted(couriers, key=lambda x: x.get('max_carrying_capacity', 0), reverse=True)
    
    while remaining_pickups:
        if courier_index >= len(sorted_couriers):
            # Need more couriers than available
            break
        
        courier = sorted_couriers[courier_index]
        courier_id = courier.get('courier_id') or courier.get('id', f'courier_{courier_index}')
        courier_name = courier.get('name', courier_id)
        capacity = courier.get('max_carrying_capacity', 1000)
        
        # Select cauldrons for this courier
        selected_cauldrons = []
        selected_volumes = {}
        total_volume = 0.0
        
        for pickup in remaining_pickups:
            if total_volume + pickup['volume_to_collect'] <= capacity:
                selected_cauldrons.append(pickup['cauldron_id'])
                selected_volumes[pickup['cauldron_id']] = pickup['volume_to_collect']
                total_volume += pickup['volume_to_collect']
        
        if not selected_cauldrons:
            # This courier can't handle any remaining pickups
            courier_index += 1
            continue
        
        # Optimize route for selected cauldrons
        route, travel_time, collected_volume = optimize_courier_route(
            graph, selected_cauldrons, capacity, selected_volumes
        )
        
        # Calculate start and end times
        # Assume 15 minutes per cauldron stop + travel time
        stop_time = len(selected_cauldrons) * 15  # minutes
        total_time_minutes = travel_time + stop_time
        
        # Start at 8:00 AM or current time if later
        start_time = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
        if start_time < datetime.now():
            start_time = datetime.now()
        
        end_time = start_time + timedelta(minutes=total_time_minutes)
        
        assignments.append({
            'courier': courier_name,
            'courier_id': courier_id,
            'route': route,
            'cauldrons_visited': selected_cauldrons,
            'start': start_time.strftime('%H:%M'),
            'end': end_time.strftime('%H:%M'),
            'travel_time_minutes': travel_time,
            'total_time_minutes': total_time_minutes,
            'volume_collected': collected_volume
        })
        
        # Remove assigned pickups
        remaining_pickups = [p for p in remaining_pickups 
                           if p['cauldron_id'] not in selected_cauldrons]
        
        courier_index += 1
    
    return {
        'date': date,
        'couriers_needed': len(assignments),
        'assignments': assignments,
        'unassigned_pickups': len(remaining_pickups)
    }

