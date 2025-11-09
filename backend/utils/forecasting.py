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
    Uses linear regression on recent data.
    """
    cauldron_data = df[df['cauldron_id'] == cauldron_id].copy()
    if len(cauldron_data) < 2:
        return 0.0
    
    # Use last N hours of data
    cutoff_time = cauldron_data['timestamp'].max() - timedelta(hours=hours)
    recent_data = cauldron_data[cauldron_data['timestamp'] >= cutoff_time].copy()
    
    if len(recent_data) < 2:
        recent_data = cauldron_data.tail(min(100, len(cauldron_data)))
    
    # Convert timestamps to numeric (hours since first timestamp)
    time_start = recent_data['timestamp'].min()
    recent_data['hours'] = (recent_data['timestamp'] - time_start).dt.total_seconds() / 3600
    
    # Filter for increasing sections only (brewing)
    recent_data = recent_data.sort_values('timestamp')
    increasing_sections = []
    current_section = []
    
    for i in range(len(recent_data)):
        if i == 0 or recent_data.iloc[i]['level'] >= recent_data.iloc[i-1]['level']:
            current_section.append(i)
        else:
            if len(current_section) > 1:
                increasing_sections.extend(current_section)
            current_section = [i]
    
    if len(current_section) > 1:
        increasing_sections.extend(current_section)
    
    if len(increasing_sections) < 2:
        return 0.0
    
    section_data = recent_data.iloc[increasing_sections]
    
    # Fit linear regression
    X = section_data[['hours']].values
    y = section_data['level'].values
    
    model = LinearRegression()
    model.fit(X, y)
    
    # Slope is in liters per hour
    brew_rate = model.coef_[0]
    return max(0.0, brew_rate)  # Ensure non-negative


def forecast_levels(
    df: pd.DataFrame,
    cauldron_info: Dict[str, Dict],
    forecast_hours: int = 24
) -> List[Dict]:
    """
    Forecast brew levels for all cauldrons.
    Returns predictions for when each cauldron will reach 90% and 100% capacity.
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
        
        # Calculate when 90% and 100% will be reached
        time_to_90 = None
        time_to_100 = None
        
        if brew_rate > 0:
            remaining_to_90 = (max_volume * 0.9) - current_level
            remaining_to_100 = max_volume - current_level
            
            if remaining_to_90 > 0:
                hours_to_90 = remaining_to_90 / brew_rate
                time_to_90 = (current_time + timedelta(hours=hours_to_90)).isoformat()
            
            if remaining_to_100 > 0:
                hours_to_100 = remaining_to_100 / brew_rate
                time_to_100 = (current_time + timedelta(hours=hours_to_100)).isoformat()
        
        forecasts.append({
            'cauldron_id': cauldron_id,
            'current_level': current_level,
            'max_volume': max_volume,
            'current_percentage': (current_level / max_volume) * 100 if max_volume > 0 else 0,
            'brew_rate_liters_per_hour': brew_rate,
            'forecast_points': forecast_points,
            'time_to_90_percent': time_to_90,
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

