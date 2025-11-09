import socket
import threading
import json
from datetime import datetime
from typing import Optional, Dict

class TCPServer:
    def __init__(self, host: str = '0.0.0.0', port: int = 8888):
        self.host = host
        self.port = port
        self.socket: Optional[socket.socket] = None
        self.running = False
        self.server_thread: Optional[threading.Thread] = None
        self.latest_data: Dict = {
            'taken_liters': 0.0,
            'reported_liters': 0.0,
            'discrepancy': 0.0,
            'timestamp': None,
            'connected': False
        }
        self.lock = threading.Lock()
    
    def calculate_discrepancy(self, taken: float, reported: float) -> float:
        """Calculate discrepancy: taken - reported"""
        return taken - reported
    
    def handle_client(self, client_socket: socket.socket, address: tuple):
        """Handle incoming client connection"""
        print(f"Client connected from {address}")
        try:
            while self.running:
                # Receive data from client
                data = client_socket.recv(1024)
                if not data:
                    break
                
                try:
                    # Try to parse as JSON
                    message = data.decode('utf-8').strip()
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
                    
                    print(f"Received data: Taken={taken_liters}L, Reported={reported_liters}L, Discrepancy={discrepancy}L")
                    
                    # Send acknowledgment
                    ack = json.dumps({'status': 'received', 'discrepancy': discrepancy})
                    client_socket.send(ack.encode('utf-8'))
                    
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
                            
                            print(f"Received data: Taken={taken_liters}L, Reported={reported_liters}L, Discrepancy={discrepancy}L")
                            
                            ack = json.dumps({'status': 'received', 'discrepancy': discrepancy})
                            client_socket.send(ack.encode('utf-8'))
                    except (ValueError, IndexError) as e:
                        print(f"Error parsing data: {e}")
                        error_response = json.dumps({'status': 'error', 'message': 'Invalid data format'})
                        client_socket.send(error_response.encode('utf-8'))
                        
        except Exception as e:
            print(f"Error handling client {address}: {e}")
        finally:
            client_socket.close()
            with self.lock:
                self.latest_data['connected'] = False
            print(f"Client {address} disconnected")
    
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
        except Exception as e:
            print(f"Error starting TCP server: {e}")
            self.running = False
            raise
    
    def stop(self):
        """Stop the TCP server"""
        self.running = False
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

