import socket
import threading
import json
import time
from datetime import datetime
from typing import Optional, Dict, List, Tuple

class TCPServer:
    def __init__(self, host: str = '0.0.0.0', port: int = 8888):
        self.host = host
        self.port = port
        self.socket: Optional[socket.socket] = None
        self.running = False
        self.server_thread: Optional[threading.Thread] = None
        self.polling_thread: Optional[threading.Thread] = None
        self.connected_clients: List[Tuple[socket.socket, tuple]] = []
        self.latest_data: Dict = {
            'taken_liters': 0.0,
            'reported_liters': 0.0,
            'discrepancy': 0.0,
            'timestamp': None,
            'connected': False
        }
        self.lock = threading.Lock()
        self.clients_lock = threading.Lock()
    
    def calculate_discrepancy(self, taken: float, reported: float) -> float:
        """Calculate discrepancy: taken - reported"""
        return taken - reported
    
    def handle_client(self, client_socket: socket.socket, address: tuple):
        """Handle incoming client connection - keeps connection alive for polling"""
        print(f"Client connected from {address}")
        
        # Add client to connected list
        with self.clients_lock:
            self.connected_clients.append((client_socket, address))
            with self.lock:
                self.latest_data['connected'] = True
        
        try:
            # Set socket timeout for receiving data
            client_socket.settimeout(5.0)
            
            while self.running:
                try:
                    # Wait for data from client (either response to poll or unsolicited data)
                    data = client_socket.recv(1024)
                    if not data:
                        break
                    
                    self.process_client_data(data, address)
                    
                except socket.timeout:
                    # Timeout is expected - continue to keep connection alive
                    continue
                except Exception as e:
                    print(f"Error receiving from client {address}: {e}")
                    break
                        
        except Exception as e:
            print(f"Error handling client {address}: {e}")
        finally:
            # Remove client from connected list
            with self.clients_lock:
                if (client_socket, address) in self.connected_clients:
                    self.connected_clients.remove((client_socket, address))
            
            client_socket.close()
            
            # Update connection status if no clients remain
            with self.clients_lock:
                if len(self.connected_clients) == 0:
                    with self.lock:
                        self.latest_data['connected'] = False
            
            print(f"Client {address} disconnected")
    
    def process_client_data(self, data: bytes, address: tuple):
        """Process data received from client"""
        try:
            # Decode the message
            message = data.decode('utf-8').strip()
            
            # Try to parse as JSON
            try:
                parsed_data = json.loads(message)
                
                taken_liters = float(parsed_data.get('taken_liters', 0))
                reported_liters = float(parsed_data.get('reported_liters', 0))
                
                discrepancy = self.calculate_discrepancy(taken_liters, reported_liters)
                
                with self.lock:
                    self.latest_data = {
                        'taken_liters': taken_liters,
                        'reported_liters': reported_liters,
                        'discrepancy': discrepancy,
                        'timestamp': datetime.now().isoformat(),
                        'connected': True
                    }
                
                print(f"Received data from {address}: Taken={taken_liters}L, Reported={reported_liters}L, Discrepancy={discrepancy}L")
                
            except json.JSONDecodeError:
                # If not JSON, try to parse as simple format: "taken,reported"
                try:
                    parts = message.split(',')
                    if len(parts) == 2:
                        taken_liters = float(parts[0].strip())
                        reported_liters = float(parts[1].strip())
                        discrepancy = self.calculate_discrepancy(taken_liters, reported_liters)
                        
                        with self.lock:
                            self.latest_data = {
                                'taken_liters': taken_liters,
                                'reported_liters': reported_liters,
                                'discrepancy': discrepancy,
                                'timestamp': datetime.now().isoformat(),
                                'connected': True
                            }
                        
                        print(f"Received data from {address}: Taken={taken_liters}L, Reported={reported_liters}L, Discrepancy={discrepancy}L")
                except (ValueError, IndexError) as e:
                    print(f"Error parsing data from {address}: {e}")
        except UnicodeDecodeError as e:
            print(f"Error decoding data from {address}: {e}")
    
    def poll_clients(self):
        """Poll all connected clients every second for data"""
        while self.running:
            time.sleep(1)  # Wait 1 second between polls
            
            with self.clients_lock:
                clients_to_remove = []
                clients_copy = self.connected_clients.copy()
            
            for client_socket, address in clients_copy:
                try:
                    # Send polling request to client
                    poll_request = json.dumps({'action': 'get_data'})
                    client_socket.send(poll_request.encode('utf-8'))
                    print(f"Polling client {address} for data...")
                except Exception as e:
                    print(f"Error polling client {address}: {e}")
                    # Mark client for removal
                    with self.clients_lock:
                        if (client_socket, address) in self.connected_clients:
                            clients_to_remove.append((client_socket, address))
            
            # Remove disconnected clients
            for client_info in clients_to_remove:
                client_socket, address = client_info
                try:
                    client_socket.close()
                except:
                    pass
                with self.clients_lock:
                    if client_info in self.connected_clients:
                        self.connected_clients.remove(client_info)
                
                # Update connection status if no clients remain
                with self.clients_lock:
                    if len(self.connected_clients) == 0:
                        with self.lock:
                            self.latest_data['connected'] = False
    
    def start(self):
        """Start the TCP server"""
        if self.running:
            return
        
        self.running = True
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        try:
            self.socket.bind((self.host, self.port))
            self.socket.listen(5)
            print(f"TCP Server listening on {self.host}:{self.port}")
            
            def server_loop():
                while self.running:
                    try:
                        client_socket, address = self.socket.accept()
                        client_thread = threading.Thread(
                            target=self.handle_client,
                            args=(client_socket, address),
                            daemon=True
                        )
                        client_thread.start()
                    except Exception as e:
                        if self.running:
                            print(f"Error accepting connection: {e}")
            
            self.server_thread = threading.Thread(target=server_loop, daemon=True)
            self.server_thread.start()
            
            # Start polling thread to request data from clients every second
            self.polling_thread = threading.Thread(target=self.poll_clients, daemon=True)
            self.polling_thread.start()
            print("Polling thread started - will request data from clients every second")
            
        except Exception as e:
            print(f"Error starting TCP server: {e}")
            self.running = False
            raise
    
    def stop(self):
        """Stop the TCP server"""
        self.running = False
        
        # Close all client connections
        with self.clients_lock:
            for client_socket, address in self.connected_clients:
                try:
                    client_socket.close()
                except:
                    pass
            self.connected_clients.clear()
        
        if self.socket:
            try:
                self.socket.close()
            except:
                pass
        print("TCP Server stopped")
    
    def get_latest_data(self) -> Dict:
        """Get the latest data received from hardware"""
        with self.lock:
            return self.latest_data.copy()

# Global instance
tcp_server = TCPServer()

