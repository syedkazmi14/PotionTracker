"""
Witch Scheduling Algorithm to create daily courier assignments.
Prevents cauldron overflow while minimizing the number of witches dispatched.
"""
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from utils.forecasting import get_forecast
from utils.route_optimization import (
    fetch_network_data, build_graph, optimize_route, Graph
)
import requests
import math

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


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points using Haversine formula (km)."""
    R = 6371  # Earth's radius in km
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) * math.sin(d_lat / 2) +
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
        math.sin(d_lon / 2) * math.sin(d_lon / 2)
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def categorize_cauldrons(forecasts: List[Dict], cauldrons: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
    """
    Categorize cauldrons into high-rate and low-rate.
    High-rate: brew_rate > 4.166 L/hour (~100 L/day)
    Low-rate: brew_rate <= 4.166 L/hour
    """
    HIGH_RATE_THRESHOLD = 4.166  # L/hour
    
    high_rate_cauldrons = []
    low_rate_cauldrons = []
    
    # Create a map of cauldron info for quick lookup
    cauldron_map = {c['id']: c for c in cauldrons}
    
    for forecast in forecasts:
        cauldron_id = forecast['cauldron_id']
        brew_rate = forecast.get('brew_rate_liters_per_hour', 0.0)
        current_level = forecast.get('current_level', 0.0)
        max_volume = forecast.get('max_volume', 1000.0)
        current_percentage = forecast.get('current_percentage', (current_level / max_volume * 100) if max_volume > 0 else 0)
        time_to_80 = forecast.get('time_to_80_percent')
        
        cauldron_info = cauldron_map.get(cauldron_id, {})
        
        cauldron_data = {
            'cauldron_id': cauldron_id,
            'brew_rate': brew_rate,
            'current_level': current_level,
            'max_volume': max_volume,
            'current_percentage': current_percentage,
            'time_to_80': time_to_80,
            'latitude': cauldron_info.get('latitude', 0.0),
            'longitude': cauldron_info.get('longitude', 0.0),
        }
        
        if brew_rate > HIGH_RATE_THRESHOLD:
            high_rate_cauldrons.append(cauldron_data)
        else:
            low_rate_cauldrons.append(cauldron_data)
    
    return high_rate_cauldrons, low_rate_cauldrons


def identify_low_rate_pickups(low_rate_cauldrons: List[Dict], target_date: datetime) -> List[Dict]:
    """
    Identify low-rate cauldrons that need pickups.
    Schedule if time_to_80h <= 24 hours.
    """
    pickup_needs = []
    current_time = datetime.now()
    target_date_end = target_date.replace(hour=23, minute=59, second=59)
    
    for cauldron in low_rate_cauldrons:
        cauldron_id = cauldron['cauldron_id']
        current_level = cauldron['current_level']
        max_volume = cauldron['max_volume']
        brew_rate = cauldron['brew_rate']
        current_percentage = cauldron['current_percentage']
        time_to_80 = cauldron.get('time_to_80')
        
        # If already at or above 80%, schedule pickup
        if current_percentage >= 80:
            volume_to_collect = min(current_level, max_volume * 0.8)
            pickup_needs.append({
                'cauldron_id': cauldron_id,
                'volume_to_collect': volume_to_collect,
                'category': 'Low Rate (80%)',
                'current_level': current_level,
                'max_volume': max_volume,
                'latitude': cauldron['latitude'],
                'longitude': cauldron['longitude'],
            })
            continue
        
        # Calculate time to 80% capacity
        if brew_rate > 0:
            remaining_to_80 = (max_volume * 0.8) - current_level
            time_to_80h = remaining_to_80 / brew_rate
            
            # Schedule if time_to_80h <= 24 hours
            if time_to_80h <= 24:
                # Calculate volume at pickup time (24h from now or at 80%, whichever comes first)
                hours_until_pickup = min(24, time_to_80h)
                volume_at_pickup = current_level + (brew_rate * hours_until_pickup)
                volume_to_collect = min(volume_at_pickup, max_volume * 0.8)
                
                pickup_needs.append({
                    'cauldron_id': cauldron_id,
                    'volume_to_collect': volume_to_collect,
                    'category': 'Low Rate (80%)',
                    'current_level': current_level,
                    'max_volume': max_volume,
                    'latitude': cauldron['latitude'],
                    'longitude': cauldron['longitude'],
                })
    
    return pickup_needs


def cluster_nearby_cauldrons(cauldrons: List[Dict], max_distance_km: float = 5.0) -> List[List[Dict]]:
    """
    Cluster geographically close cauldrons together.
    Returns list of clusters.
    """
    clusters = []
    unassigned = cauldrons.copy()
    
    while unassigned:
        # Start a new cluster with the first unassigned cauldron
        cluster = [unassigned.pop(0)]
        
        # Find nearby cauldrons
        i = 0
        while i < len(unassigned):
            cauldron = unassigned[i]
            # Check if this cauldron is close to any in the cluster
            is_nearby = False
            for cluster_cauldron in cluster:
                distance = calculate_distance(
                    cluster_cauldron['latitude'], cluster_cauldron['longitude'],
                    cauldron['latitude'], cauldron['longitude']
                )
                if distance <= max_distance_km:
                    is_nearby = True
                    break
            
            if is_nearby:
                cluster.append(unassigned.pop(i))
            else:
                i += 1
        
        clusters.append(cluster)
    
    return clusters


def optimize_witch_route(
    graph: Graph,
    cauldrons_to_visit: List[str],
    volumes: Dict[str, float],
    courier_name: str
) -> Tuple[List[str], float, float, float]:
    """
    Optimize route for a single witch.
    Returns (route, travel_time_minutes, distance_km, total_brew_collected).
    """
    if not cauldrons_to_visit:
        # Return to market empty
        path, time, distance = graph.dijkstra('market', 'market')
        return path, time, distance, 0.0
    
    # Optimize route using nearest neighbor with Dijkstra
    route, time, distance = optimize_route(graph, cauldrons_to_visit, 'market', 'market')
    
    # Calculate total volume collected
    total_volume = sum(volumes.get(cid, 0.0) for cid in cauldrons_to_visit)
    
    return route, time, distance, total_volume


def create_daily_schedule(date: Optional[str] = None) -> Dict:
    """
    Create daily schedule using Witch Scheduling Algorithm.
    Prevents cauldron overflow while minimizing the number of witches dispatched.
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
    
    if not forecasts:
        return {
            'date': date,
            'couriers_needed': 0,
            'assignments': [],
            'total_distance_km': 0.0
        }
    
    # Categorize cauldrons by brew rate
    high_rate_cauldrons, low_rate_cauldrons = categorize_cauldrons(forecasts, cauldrons)
    
    print(f"[Schedule] Date: {date}")
    print(f"[Schedule] High-rate cauldrons: {len(high_rate_cauldrons)}")
    print(f"[Schedule] Low-rate cauldrons: {len(low_rate_cauldrons)}")
    
    # Fixed witch capacity: 100L
    WITCH_CAPACITY = 100.0
    
    assignments = []
    courier_index = 0
    
    # ===================================================================
    # HIGH-RATE CAULDRONS: Daily pickups, 2 witches per cauldron
    # ===================================================================
    for high_rate_cauldron in high_rate_cauldrons:
        cauldron_id = high_rate_cauldron['cauldron_id']
        current_level = high_rate_cauldron['current_level']
        max_volume = high_rate_cauldron['max_volume']
        
        # Calculate volume to collect (80% of max or current level, whichever is less)
        volume_to_collect = min(current_level, max_volume * 0.8)
        
        # Split between two witches: first takes ~70L, second takes ~30L
        first_witch_volume = min(70.0, volume_to_collect)
        second_witch_volume = min(30.0, volume_to_collect - first_witch_volume)
        
        # First witch assignment
        if first_witch_volume > 0:
            route, travel_time, distance, collected_volume = optimize_witch_route(
                graph, [cauldron_id], {cauldron_id: first_witch_volume}, f"Witch {courier_index + 1}"
            )
            
            # Debug: print route
            print(f"[Schedule] High-rate cauldron {cauldron_id} - First witch route (before fix): {route}")
            
            # Ensure route includes cauldron - rebuild if necessary
            if cauldron_id not in route or len(route) <= 1:
                # Rebuild route: market -> cauldron -> market
                route = ['market', cauldron_id, 'market']
                print(f"[Schedule] Rebuilt route for {cauldron_id}: {route}")
            
            stop_time = 15  # 15 minutes per stop
            total_time_minutes = travel_time + stop_time
            
            start_time = target_date.replace(hour=8, minute=0, second=0, microsecond=0)
            if start_time < datetime.now():
                start_time = datetime.now()
            end_time = start_time + timedelta(minutes=total_time_minutes)
            
            # Get courier name if available
            courier_name = couriers[courier_index % len(couriers)]['name'] if couriers else f"Witch {courier_index + 1}"
            courier_id = couriers[courier_index % len(couriers)].get('courier_id') or couriers[courier_index % len(couriers)].get('id', f"courier_{courier_index + 1}") if couriers else f"courier_{courier_index + 1}"
            
            assignments.append({
                'courier': courier_name,
                'courier_id': courier_id,
                'route': route,
                'cauldrons_visited': [cauldron_id],
                'start': start_time.isoformat(),
                'end': end_time.isoformat(),
                'travel_time_minutes': int(travel_time),
                'total_time_minutes': int(total_time_minutes),
                'volume_collected': collected_volume,
                'total_brew_collected': collected_volume,
                'distance_km': distance,
                'category': 'High Rate'
            })
            courier_index += 1
        
        # Second witch assignment
        if second_witch_volume > 0:
            route, travel_time, distance, collected_volume = optimize_witch_route(
                graph, [cauldron_id], {cauldron_id: second_witch_volume}, f"Witch {courier_index + 1}"
            )
            
            # Debug: print route
            print(f"[Schedule] High-rate cauldron {cauldron_id} - Second witch route (before fix): {route}")
            
            # Ensure route includes cauldron - rebuild if necessary
            if cauldron_id not in route or len(route) <= 1:
                # Rebuild route: market -> cauldron -> market
                route = ['market', cauldron_id, 'market']
                print(f"[Schedule] Rebuilt route for {cauldron_id}: {route}")
            
            stop_time = 15
            total_time_minutes = travel_time + stop_time
            
            start_time = target_date.replace(hour=8, minute=0, second=0, microsecond=0)
            if start_time < datetime.now():
                start_time = datetime.now()
            end_time = start_time + timedelta(minutes=total_time_minutes)
            
            courier_name = couriers[courier_index % len(couriers)]['name'] if couriers else f"Witch {courier_index + 1}"
            courier_id = couriers[courier_index % len(couriers)].get('courier_id') or couriers[courier_index % len(couriers)].get('id', f"courier_{courier_index + 1}") if couriers else f"courier_{courier_index + 1}"
            
            assignments.append({
                'courier': courier_name,
                'courier_id': courier_id,
                'route': route,
                'cauldrons_visited': [cauldron_id],
                'start': start_time.isoformat(),
                'end': end_time.isoformat(),
                'travel_time_minutes': int(travel_time),
                'total_time_minutes': int(total_time_minutes),
                'volume_collected': collected_volume,
                'total_brew_collected': collected_volume,
                'distance_km': distance,
                'category': 'High Rate'
            })
            courier_index += 1
    
    # Try to combine nearby high-rate cauldrons if possible
    # Cluster high-rate cauldrons and see if we can combine some routes
    if len(high_rate_cauldrons) > 1:
        clusters = cluster_nearby_cauldrons(high_rate_cauldrons, max_distance_km=5.0)
        # For now, we keep the 2-witch-per-cauldron approach, but could optimize further
    
    # ===================================================================
    # LOW-RATE CAULDRONS: Schedule if time_to_80h <= 24 hours
    # ===================================================================
    low_rate_pickups = identify_low_rate_pickups(low_rate_cauldrons, target_date)
    
    print(f"[Schedule] Low-rate cauldrons needing pickups: {len(low_rate_pickups)}")
    
    # Assign low-rate pickups to witches with spare capacity
    remaining_pickups = low_rate_pickups.copy()
    
    # First, try to add to existing witches with spare capacity
    for assignment in assignments:
        current_volume = assignment.get('total_brew_collected', assignment.get('volume_collected', 0.0))
        spare_capacity = WITCH_CAPACITY - current_volume
        
        if spare_capacity > 10:  # At least 10L spare capacity
            # Try to find a nearby low-rate cauldron that fits
            best_pickup = None
            best_distance = float('inf')
            
            for pickup in remaining_pickups:
                if pickup['volume_to_collect'] <= spare_capacity:
                    # Calculate distance to this pickup
                    # Get the last cauldron in the route
                    last_cauldron_id = assignment['route'][-2] if len(assignment['route']) > 1 else 'market'
                    if last_cauldron_id in graph.nodes:
                        last_node = graph.nodes[last_cauldron_id]
                        distance = calculate_distance(
                            last_node.get('latitude', 0), last_node.get('longitude', 0),
                            pickup['latitude'], pickup['longitude']
                        )
                        if distance < best_distance:
                            best_distance = distance
                            best_pickup = pickup
            
            if best_pickup:
                # Add this pickup to the existing route
                pickup_id = best_pickup['cauldron_id']
                assignment['cauldrons_visited'].append(pickup_id)
                
                # Build volumes dict for all cauldrons in route
                # For existing cauldrons, estimate volume based on category
                volumes = {}
                for cid in assignment['cauldrons_visited']:
                    if cid == pickup_id:
                        volumes[cid] = best_pickup['volume_to_collect']
                    else:
                        # Estimate volume for existing cauldrons (use average or from forecast)
                        # For now, use a default based on category
                        if assignment.get('category') == 'High Rate':
                            volumes[cid] = 50.0  # Average for high-rate
                        else:
                            volumes[cid] = 30.0  # Average for low-rate
                
                # Re-optimize route
                route, travel_time, distance, collected_volume = optimize_witch_route(
                    graph, assignment['cauldrons_visited'], volumes, assignment['courier']
                )
                assignment['route'] = route
                assignment['travel_time_minutes'] = int(travel_time)
                assignment['distance_km'] = distance
                assignment['total_brew_collected'] = collected_volume
                assignment['volume_collected'] = collected_volume
                
                # Update times
                stop_time = len(assignment['cauldrons_visited']) * 15
                assignment['total_time_minutes'] = int(travel_time + stop_time)
                start_time = datetime.fromisoformat(assignment['start'].replace('Z', '+00:00'))
                end_time = start_time + timedelta(minutes=assignment['total_time_minutes'])
                assignment['end'] = end_time.isoformat()
                
                remaining_pickups.remove(best_pickup)
    
    # Assign remaining low-rate pickups to new witches
    while remaining_pickups:
        selected_cauldrons = []
        selected_volumes = {}
        total_volume = 0.0
        
        for pickup in remaining_pickups:
            if total_volume + pickup['volume_to_collect'] <= WITCH_CAPACITY:
                selected_cauldrons.append(pickup['cauldron_id'])
                selected_volumes[pickup['cauldron_id']] = pickup['volume_to_collect']
                total_volume += pickup['volume_to_collect']
        
        if not selected_cauldrons:
            # Can't assign any more pickups
            break
        
        # Optimize route for selected cauldrons
        courier_name = couriers[courier_index % len(couriers)]['name'] if couriers else f"Witch {courier_index + 1}"
        route, travel_time, distance, collected_volume = optimize_witch_route(
            graph, selected_cauldrons, selected_volumes, courier_name
        )
        
        # Debug: print route
        print(f"[Schedule] Low-rate pickup route for {courier_name} (before fix): {route}, cauldrons: {selected_cauldrons}")
        
        # Ensure all selected cauldrons are in route - rebuild if necessary
        route_cauldrons = [node for node in route if node != 'market']
        missing_cauldrons = [cid for cid in selected_cauldrons if cid not in route_cauldrons]
        
        if missing_cauldrons or len(route) <= 1:
            # Rebuild route: market -> all cauldrons -> market
            route = ['market'] + selected_cauldrons + ['market']
            print(f"[Schedule] Rebuilt route for {courier_name}: {route}")
        
        stop_time = len(selected_cauldrons) * 15
        total_time_minutes = travel_time + stop_time
        
        start_time = target_date.replace(hour=8, minute=0, second=0, microsecond=0)
        if start_time < datetime.now():
            start_time = datetime.now()
        end_time = start_time + timedelta(minutes=total_time_minutes)
        
        courier_id = couriers[courier_index % len(couriers)].get('courier_id') or couriers[courier_index % len(couriers)].get('id', f"courier_{courier_index + 1}") if couriers else f"courier_{courier_index + 1}"
        
        assignments.append({
            'courier': courier_name,
            'courier_id': courier_id,
            'route': route,
            'cauldrons_visited': selected_cauldrons,
            'start': start_time.isoformat(),
            'end': end_time.isoformat(),
            'travel_time_minutes': int(travel_time),
            'total_time_minutes': int(total_time_minutes),
            'volume_collected': collected_volume,
            'total_brew_collected': collected_volume,
            'distance_km': distance,
            'category': 'Low Rate (80%)'
        })
        
        # Remove assigned pickups
        remaining_pickups = [p for p in remaining_pickups 
                           if p['cauldron_id'] not in selected_cauldrons]
        
        courier_index += 1
    
    # Calculate total distance
    total_distance = sum(a.get('distance_km', 0.0) for a in assignments)
    
    # Format assignments to match expected output format
    formatted_assignments = []
    for assignment in assignments:
        route = assignment.get('route', [])
        cauldrons_visited = assignment.get('cauldrons_visited', [])
        
        # Ensure route includes all cauldrons_visited
        # Check if route is incomplete (only market or missing cauldrons)
        route_cauldrons = [node for node in route if node != 'market']
        missing_cauldrons = [cid for cid in cauldrons_visited if cid not in route_cauldrons]
        
        if len(route) <= 1 or missing_cauldrons or not route_cauldrons:
            # Route is incomplete, rebuild from cauldrons_visited
            if cauldrons_visited:
                route = ['market'] + cauldrons_visited + ['market']
                print(f"[Schedule] Final validation: Rebuilt route for {assignment.get('courier', 'Unknown')}: {route}")
            else:
                print(f"[Schedule] WARNING: No cauldrons_visited for {assignment.get('courier', 'Unknown')}, route: {route}")
        
        print(f"[Schedule] Final route for {assignment.get('courier', 'Unknown')}: {route}, cauldrons_visited: {cauldrons_visited}")
        
        formatted_assignments.append({
            'courier': assignment['courier'],
            'courier_id': assignment.get('courier_id', ''),
            'route': route,
            'cauldrons_visited': cauldrons_visited,
            'start': assignment['start'],
            'end': assignment.get('end', ''),
            'travel_time_minutes': assignment['travel_time_minutes'],
            'total_time_minutes': assignment.get('total_time_minutes', 0),
            'volume_collected': assignment.get('total_brew_collected', assignment.get('volume_collected', 0.0)),
            'distance_km': assignment.get('distance_km', 0.0),
            # Additional fields for compatibility
            'total_brew_collected': assignment.get('total_brew_collected', assignment.get('volume_collected', 0.0)),
            'travel_time': assignment['travel_time_minutes'],
            'category': assignment.get('category', 'Unknown'),
        })
    
    return {
        'date': date,
        'couriers_needed': len(assignments),
        'assignments': formatted_assignments,
        'unassigned_pickups': len(remaining_pickups),
        'total_distance_km': total_distance
    }

