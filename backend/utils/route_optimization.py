"""
Route optimization module using Dijkstra's algorithm.
Optimizes courier routes to minimize travel time.
"""
from typing import Dict, List, Tuple, Optional
import heapq
import requests


class Graph:
    """Weighted graph for route optimization."""
    
    def __init__(self):
        self.nodes = {}  # node_id -> {lat, lon, ...}
        self.edges = {}  # (from, to) -> travel_time_minutes
    
    def add_node(self, node_id: str, **attributes):
        """Add a node to the graph."""
        self.nodes[node_id] = attributes
    
    def add_edge(self, from_node: str, to_node: str, travel_time: float):
        """Add a directed edge to the graph."""
        if from_node not in self.edges:
            self.edges[from_node] = {}
        self.edges[from_node][to_node] = travel_time
    
    def get_neighbors(self, node_id: str) -> List[Tuple[str, float]]:
        """Get neighbors of a node with their edge weights."""
        if node_id not in self.edges:
            return []
        return [(neighbor, weight) for neighbor, weight in self.edges[node_id].items()]
    
    def dijkstra(self, start: str, end: str) -> Tuple[List[str], float]:
        """
        Find shortest path from start to end using Dijkstra's algorithm.
        Returns (path, total_time).
        """
        if start not in self.nodes or end not in self.nodes:
            return [], float('inf')
        
        # Priority queue: (total_time, current_node, path)
        pq = [(0, start, [start])]
        visited = set()
        
        while pq:
            total_time, current, path = heapq.heappop(pq)
            
            if current in visited:
                continue
            
            visited.add(current)
            
            if current == end:
                return path, total_time
            
            for neighbor, edge_time in self.get_neighbors(current):
                if neighbor not in visited:
                    new_time = total_time + edge_time
                    new_path = path + [neighbor]
                    heapq.heappush(pq, (new_time, neighbor, new_path))
        
        return [], float('inf')  # No path found


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
        
        graph.add_edge(from_node, to_node, travel_time)
        # Add reverse edge (assuming bidirectional)
        graph.add_edge(to_node, from_node, travel_time)
    
    return graph


def optimize_route(
    graph: Graph,
    cauldrons_to_visit: List[str],
    start_node: str = 'market',
    end_node: str = 'market'
) -> Tuple[List[str], float]:
    """
    Optimize route to visit multiple cauldrons.
    Uses nearest neighbor heuristic with Dijkstra for path segments.
    """
    if not cauldrons_to_visit:
        path, time = graph.dijkstra(start_node, end_node)
        return path, time
    
    # Nearest neighbor approach
    route = [start_node]
    unvisited = set(cauldrons_to_visit)
    current = start_node
    total_time = 0.0
    
    while unvisited:
        # Find nearest unvisited cauldron
        nearest = None
        min_time = float('inf')
        nearest_path = []
        
        for cauldron in unvisited:
            path, time = graph.dijkstra(current, cauldron)
            if time < min_time:
                min_time = time
                nearest = cauldron
                nearest_path = path
        
        if nearest is None:
            break
        
        # Add path to route (skip first node as it's already in route)
        route.extend(nearest_path[1:])
        total_time += min_time
        unvisited.remove(nearest)
        current = nearest
    
    # Return to end node
    if current != end_node:
        path, time = graph.dijkstra(current, end_node)
        route.extend(path[1:])
        total_time += time
    
    return route, total_time


def optimize_courier_route(
    graph: Graph,
    cauldrons_to_visit: List[str],
    courier_capacity: float,
    cauldron_volumes: Dict[str, float]
) -> Tuple[List[str], float, float]:
    """
    Optimize route for a single courier considering capacity.
    Returns (route, total_time, total_collected_volume).
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
        path, time = graph.dijkstra('market', 'market')
        return path, time, 0.0
    
    # Optimize route for collectable cauldrons
    route, time = optimize_route(graph, collectable, 'market', 'market')
    
    return route, time, collected_volume

