"""
Route optimization module using Dijkstra's algorithm.
Optimizes courier routes to minimize travel time and distance.
"""
from typing import Dict, List, Tuple, Optional
import heapq
import requests
import math


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate distance between two points using Haversine formula.
    Returns distance in kilometers.
    """
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


class Graph:
    """Weighted graph for route optimization."""
    
    def __init__(self):
        self.nodes = {}  # node_id -> {lat, lon, ...}
        self.edges = {}  # (from, to) -> {travel_time, distance}
    
    def add_node(self, node_id: str, **attributes):
        """Add a node to the graph."""
        self.nodes[node_id] = attributes
    
    def add_edge(self, from_node: str, to_node: str, travel_time: float, distance: Optional[float] = None):
        """Add a directed edge to the graph."""
        if from_node not in self.edges:
            self.edges[from_node] = {}
        
        # Calculate distance if not provided
        if distance is None and from_node in self.nodes and to_node in self.nodes:
            from_node_data = self.nodes[from_node]
            to_node_data = self.nodes[to_node]
            if 'latitude' in from_node_data and 'longitude' in from_node_data:
                distance = haversine_distance(
                    from_node_data['latitude'], from_node_data['longitude'],
                    to_node_data['latitude'], to_node_data['longitude']
                )
        
        self.edges[from_node][to_node] = {
            'travel_time': travel_time,
            'distance': distance or 0.0
        }
    
    def get_neighbors(self, node_id: str) -> List[Tuple[str, float, float]]:
        """Get neighbors of a node with their edge weights (travel_time, distance)."""
        if node_id not in self.edges:
            return []
        return [
            (neighbor, edge_data['travel_time'], edge_data['distance'])
            for neighbor, edge_data in self.edges[node_id].items()
        ]
    
    def dijkstra(self, start: str, end: str) -> Tuple[List[str], float, float]:
        """
        Find shortest path from start to end using Dijkstra's algorithm.
        Returns (path, total_time, total_distance).
        """
        if start not in self.nodes or end not in self.nodes:
            return [], float('inf'), float('inf')
        
        # Priority queue: (total_time, current_node, path, total_distance)
        pq = [(0, start, [start], 0.0)]
        visited = set()
        
        while pq:
            total_time, current, path, total_distance = heapq.heappop(pq)
            
            if current in visited:
                continue
            
            visited.add(current)
            
            if current == end:
                return path, total_time, total_distance
            
            for neighbor, edge_time, edge_distance in self.get_neighbors(current):
                if neighbor not in visited:
                    new_time = total_time + edge_time
                    new_distance = total_distance + edge_distance
                    new_path = path + [neighbor]
                    heapq.heappush(pq, (new_time, neighbor, new_path, new_distance))
        
        return [], float('inf'), float('inf')  # No path found


def fetch_network_data() -> Dict:
    """Fetch network data from API."""
    try:
        response = requests.get('https://hackutd2025.eog.systems/api/Information/network')
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error fetching network data: {e}")
        return {'edges': []}


def build_graph(network_data: Dict, cauldrons: List[Dict], market: Dict) -> Graph:
    """
    Build graph from network data, cauldrons, and market.
    """
    graph = Graph()
    
    # Add market node
    graph.add_node('market', 
                   latitude=market['latitude'], 
                   longitude=market['longitude'],
                   type='market')
    
    # Add cauldron nodes
    for cauldron in cauldrons:
        graph.add_node(cauldron['id'],
                      latitude=cauldron['latitude'],
                      longitude=cauldron['longitude'],
                      type='cauldron',
                      max_volume=cauldron.get('max_volume', 1000))
    
    # Add edges from network data
    for edge in network_data.get('edges', []):
        from_node = edge['from']
        to_node = edge['to']
        travel_time = edge['travel_time_minutes']
        distance = edge.get('distance_km')  # Optional distance from API
        
        graph.add_edge(from_node, to_node, travel_time, distance)
        # Add reverse edge (assuming bidirectional)
        graph.add_edge(to_node, from_node, travel_time, distance)
    
    return graph


def optimize_route(
    graph: Graph,
    cauldrons_to_visit: List[str],
    start_node: str = 'market',
    end_node: str = 'market'
) -> Tuple[List[str], float, float]:
    """
    Optimize route to visit multiple cauldrons.
    Uses nearest neighbor heuristic with Dijkstra for path segments.
    Falls back to direct routes if network paths aren't available.
    Returns (route, total_time, total_distance).
    """
    if not cauldrons_to_visit:
        path, time, distance = graph.dijkstra(start_node, end_node)
        if not path or len(path) == 0:
            # Fallback: return just market to market
            return [start_node, end_node] if start_node != end_node else [start_node], 0.0, 0.0
        return path, time, distance
    
    # Filter out cauldrons that don't exist in the graph
    valid_cauldrons = [c for c in cauldrons_to_visit if c in graph.nodes]
    
    if not valid_cauldrons:
        # No valid cauldrons, return market route
        return [start_node, end_node] if start_node != end_node else [start_node], 0.0, 0.0
    
    # Nearest neighbor approach
    route = [start_node]
    unvisited = set(valid_cauldrons)
    current = start_node
    total_time = 0.0
    total_distance = 0.0
    
    while unvisited:
        # Find nearest unvisited cauldron
        nearest = None
        min_time = float('inf')
        nearest_path = []
        
        for cauldron in unvisited:
            path, time, distance = graph.dijkstra(current, cauldron)
            # If path not found, calculate direct distance as fallback
            if not path or len(path) == 0 or time == float('inf'):
                # Fallback: use direct route
                if current in graph.nodes and cauldron in graph.nodes:
                    current_node = graph.nodes[current]
                    cauldron_node = graph.nodes[cauldron]
                    if 'latitude' in current_node and 'longitude' in current_node and \
                       'latitude' in cauldron_node and 'longitude' in cauldron_node:
                        direct_distance = haversine_distance(
                            current_node['latitude'], current_node['longitude'],
                            cauldron_node['latitude'], cauldron_node['longitude']
                        )
                        # Estimate travel time: assume 30 km/h average speed
                        estimated_time = (direct_distance / 30.0) * 60  # minutes
                        if estimated_time < min_time:
                            min_time = estimated_time
                            nearest = cauldron
                            nearest_path = [current, cauldron]
            else:
                if time < min_time:
                    min_time = time
                    nearest = cauldron
                    nearest_path = path
        
        if nearest is None:
            # Can't find path to any remaining cauldron, add them directly
            for cauldron in unvisited:
                if cauldron not in route:
                    route.append(cauldron)
            break
        
        # Add path to route (skip first node as it's already in route)
        if len(nearest_path) > 1:
            route.extend(nearest_path[1:])
        else:
            route.append(nearest)
        total_time += min_time
        # Get distance for this segment
        if nearest_path and len(nearest_path) > 1:
            _, _, segment_distance = graph.dijkstra(current, nearest)
            if segment_distance == float('inf') and current in graph.nodes and nearest in graph.nodes:
                # Calculate direct distance
                current_node = graph.nodes[current]
                nearest_node = graph.nodes[nearest]
                if 'latitude' in current_node and 'longitude' in current_node and \
                   'latitude' in nearest_node and 'longitude' in nearest_node:
                    segment_distance = haversine_distance(
                        current_node['latitude'], current_node['longitude'],
                        nearest_node['latitude'], nearest_node['longitude']
                    )
            total_distance += segment_distance if segment_distance != float('inf') else 0.0
        unvisited.remove(nearest)
        current = nearest
    
    # Return to end node
    if current != end_node:
        path, time, distance = graph.dijkstra(current, end_node)
        if path and len(path) > 0 and time != float('inf'):
            route.extend(path[1:])
            total_time += time
            total_distance += distance
        else:
            # Fallback: direct route to end
            route.append(end_node)
            if current in graph.nodes and end_node in graph.nodes:
                current_node = graph.nodes[current]
                end_node_data = graph.nodes[end_node]
                if 'latitude' in current_node and 'longitude' in current_node and \
                   'latitude' in end_node_data and 'longitude' in end_node_data:
                    direct_distance = haversine_distance(
                        current_node['latitude'], current_node['longitude'],
                        end_node_data['latitude'], end_node_data['longitude']
                    )
                    total_distance += direct_distance
                    estimated_time = (direct_distance / 30.0) * 60
                    total_time += estimated_time
    
    # Ensure route has at least start, cauldrons, and end
    if len(route) == 1 and route[0] == start_node:
        # Only market, add cauldrons directly
        route.extend(valid_cauldrons)
        if end_node not in route:
            route.append(end_node)
    
    return route, total_time, total_distance


def optimize_courier_route(
    graph: Graph,
    cauldrons_to_visit: List[str],
    courier_capacity: float,
    cauldron_volumes: Dict[str, float]
) -> Tuple[List[str], float, float, float]:
    """
    Optimize route for a single courier considering capacity.
    Returns (route, total_time, total_distance, total_collected_volume).
    """
    # Filter cauldrons that can be collected (based on capacity)
    collectable = []
    collected_volume = 0.0
    
    for cauldron_id in cauldrons_to_visit:
        volume = cauldron_volumes.get(cauldron_id, 0)
        if collected_volume + volume <= courier_capacity:
            collectable.append(cauldron_id)
            collected_volume += volume
        else:
            break  # Can't collect more
    
    if not collectable:
        # Return to market empty
        path, time, distance = graph.dijkstra('market', 'market')
        return path, time, distance, 0.0
    
    # Optimize route for collectable cauldrons
    route, time, distance = optimize_route(graph, collectable, 'market', 'market')
    
    return route, time, distance, collected_volume

