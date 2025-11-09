"""
Forecasting module to predict brew levels in cauldrons.
Uses linear regression and exponential smoothing to forecast future levels.
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sklearn.linear_model import LinearRegression
from typing import Dict, List, Optional
import requests


def fetch_historical_data() -> pd.DataFrame:
    """Fetch historical data from the API."""
    try:
        response = requests.get('https://hackutd2025.eog.systems/api/Data')
        response.raise_for_status()
        data = response.json()
        
        # Convert to DataFrame
        records = []
        for row in data:
            timestamp = datetime.fromisoformat(row['timestamp'].replace('Z', '+00:00'))
            for cauldron_id, level in row['cauldron_levels'].items():
                records.append({
                    'timestamp': timestamp,
                    'cauldron_id': cauldron_id,
                    'level': level
                })
        
        df = pd.DataFrame(records)
        df = df.sort_values('timestamp')
        return df
    except Exception as e:
        print(f"Error fetching historical data: {e}")
        return pd.DataFrame()


def calculate_brew_rate(df: pd.DataFrame, cauldron_id: str, hours: int = 24) -> float:
    """
    Calculate the average brew rate (liters per hour) for a cauldron.
    Uses linear regression on increasing sections only.
    Extends time window if insufficient data is found.
    """
    cauldron_data = df[df['cauldron_id'] == cauldron_id].copy()
    if len(cauldron_data) < 2:
        print(f"[Brew Rate] {cauldron_id}: Insufficient data points ({len(cauldron_data)})")
        return 0.0
    
    # Sort by timestamp to ensure proper ordering
    cauldron_data = cauldron_data.sort_values('timestamp').copy()
    
    # Try progressively longer time windows if we don't find enough data
    time_windows = [24, 48, 72, 168, 336]  # 24h, 48h, 72h, 1 week, 2 weeks
    max_data_points = 1000  # Maximum data points to use
    
    for hours_window in time_windows:
        # Use last N hours of data
        cutoff_time = cauldron_data['timestamp'].max() - timedelta(hours=hours_window)
        recent_data = cauldron_data[cauldron_data['timestamp'] >= cutoff_time].copy()
        
        if len(recent_data) < 2:
            # If still not enough, use all available data (up to max_data_points)
            recent_data = cauldron_data.tail(min(max_data_points, len(cauldron_data))).copy()
        
        if len(recent_data) < 2:
            continue
        
        # Convert timestamps to numeric (hours since first timestamp)
        time_start = recent_data['timestamp'].min()
        recent_data = recent_data.sort_values('timestamp').copy()
        recent_data['hours'] = (recent_data['timestamp'] - time_start).dt.total_seconds() / 3600
        
        # Find increasing sections only (brewing periods)
        increasing_sections = []
        current_section = []
        
        for i in range(len(recent_data)):
            if i == 0:
                current_section.append(i)
            elif recent_data.iloc[i]['level'] >= recent_data.iloc[i-1]['level']:
                # Level is same or increasing - continue current section
                current_section.append(i)
            else:
                # Level decreased - end current section and start new one
                if len(current_section) >= 2:
                    increasing_sections.extend(current_section)
                current_section = [i]
        
        # Don't forget the last section
        if len(current_section) >= 2:
            increasing_sections.extend(current_section)
        
        # If we found enough increasing sections, calculate brew rate
        if len(increasing_sections) >= 2:
            section_data = recent_data.iloc[increasing_sections].copy()
            
            # Fit linear regression
            X = section_data[['hours']].values
            y = section_data['level'].values
            
            model = LinearRegression()
            model.fit(X, y)
            
            # Slope is in liters per hour
            brew_rate = model.coef_[0]
            brew_rate = max(0.0, brew_rate)  # Ensure non-negative
            
            if brew_rate > 0:
                print(f"[Brew Rate] {cauldron_id}: Found {len(increasing_sections)} increasing points in {hours_window}h window, rate={brew_rate:.4f} L/h")
                return brew_rate
            else:
                print(f"[Brew Rate] {cauldron_id}: Found {len(increasing_sections)} increasing points but rate was {brew_rate:.4f}, trying next window")
        else:
            print(f"[Brew Rate] {cauldron_id}: Only found {len(increasing_sections)} increasing points in {hours_window}h window, trying next window")
    
    # If we exhausted all time windows and still no data
    print(f"[Brew Rate] {cauldron_id}: Could not find sufficient increasing sections in any time window")
    return 0.0


def forecast_levels(
    df: pd.DataFrame,
    cauldron_info: Dict[str, Dict],
    forecast_hours: int = 24
) -> List[Dict]:
    """
    Forecast brew levels for all cauldrons.
    Returns predictions for when each cauldron will reach 80% and 100% capacity.
    """
    forecasts = []
    current_time = datetime.now()
    
    for cauldron_id, info in cauldron_info.items():
        max_volume = info.get('max_volume', 1000)
        current_level = 0.0
        
        # Get current level from most recent data
        cauldron_data = df[df['cauldron_id'] == cauldron_id]
        if len(cauldron_data) > 0:
            current_level = cauldron_data.iloc[-1]['level']
        
        # Calculate brew rate
        brew_rate = calculate_brew_rate(df, cauldron_id)
        
        # Debug logging
        if brew_rate > 0:
            print(f"[Forecast] {cauldron_id}: brew_rate={brew_rate:.4f}, current_level={current_level:.2f}, max_volume={max_volume:.2f}, current_percentage={(current_level/max_volume*100) if max_volume > 0 else 0:.2f}%")
        
        # Forecast future levels
        forecast_points = []
        for hour in range(0, forecast_hours + 1, 1):
            predicted_level = current_level + (brew_rate * hour)
            predicted_level = min(predicted_level, max_volume)  # Cap at max
            
            forecast_points.append({
                'timestamp': (current_time + timedelta(hours=hour)).isoformat(),
                'level': predicted_level,
                'percentage': (predicted_level / max_volume) * 100
            })
        
        # Calculate when 80% and 100% will be reached
        time_to_80 = None
        time_to_100 = None
        
        current_percentage = (current_level / max_volume) * 100 if max_volume > 0 else 0
        
        # Always calculate time_to_80 if we have a brew rate (use a small epsilon to handle floating point issues)
        if brew_rate > 1e-10:  # Very small threshold to handle floating point precision
            remaining_to_80 = (max_volume * 0.8) - current_level
            remaining_to_100 = max_volume - current_level
            
            # Calculate time to 80% - always set a value if brew_rate > 0
            if remaining_to_80 > 0:
                # Will reach 80% in the future
                hours_to_80 = remaining_to_80 / brew_rate
                time_to_80 = (current_time + timedelta(hours=hours_to_80)).isoformat()
                print(f"[Forecast] {cauldron_id}: Will reach 80% in {hours_to_80:.2f} hours at {time_to_80}")
            else:
                # Already at or above 80% - set to current time
                time_to_80 = current_time.isoformat()
                print(f"[Forecast] {cauldron_id}: Already at/above 80%, setting time_to_80 to {time_to_80}")
            
            # Calculate time to 100%
            if remaining_to_100 > 0:
                hours_to_100 = remaining_to_100 / brew_rate
                time_to_100 = (current_time + timedelta(hours=hours_to_100)).isoformat()
            else:
                # Already at or above 100% - set to current time
                time_to_100 = current_time.isoformat()
        elif brew_rate == 0:
            print(f"[Forecast] {cauldron_id}: brew_rate is 0, cannot calculate time_to_80")
        elif brew_rate < 0:
            print(f"[Forecast] {cauldron_id}: brew_rate is negative ({brew_rate}), this shouldn't happen")
        
        # Ensure time_to_80 is set if already at 80% even without brew rate
        if time_to_80 is None and current_percentage >= 80:
            time_to_80 = current_time.isoformat()
            print(f"[Forecast] {cauldron_id}: No brew rate but at 80%, setting time_to_80 to {time_to_80}")
        
        forecasts.append({
            'cauldron_id': cauldron_id,
            'current_level': current_level,
            'max_volume': max_volume,
            'current_percentage': (current_level / max_volume) * 100 if max_volume > 0 else 0,
            'brew_rate_liters_per_hour': brew_rate,
            'forecast_points': forecast_points,
            'time_to_80_percent': time_to_80,
            'time_to_100_percent': time_to_100,
            'at_risk_12h': time_to_100 is not None and (
                datetime.fromisoformat(time_to_100.replace('Z', '+00:00')) - current_time
            ).total_seconds() / 3600 < 12
        })
    
    return forecasts


def get_forecast(cauldron_info: Dict[str, Dict]) -> List[Dict]:
    """
    Main function to get forecast data.
    Fetches historical data and generates forecasts.
    """
    df = fetch_historical_data()
    if df.empty:
        return []
    
    return forecast_levels(df, cauldron_info)

