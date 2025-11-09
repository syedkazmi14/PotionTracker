import requests
import datetime
import pandas as pd
from pathlib import Path


def get_cauldron_data():
    # get data
    if not Path("data.csv").exists():
        r = requests.get("https://hackutd2025.eog.systems/api/Data/?start_date=0&end_date=2000000000")
        
        if r.status_code == 200:
            data = r.json()
            
            
            new_data = []
            for row in data:
                new_row = row["cauldron_levels"].copy()
                dt_object = datetime.datetime.fromisoformat(row["timestamp"])
                timestamp_number = dt_object.timestamp()
                new_row["time"] = timestamp_number
                new_data.append(new_row)
            df = pd.DataFrame(new_data)
        
            df.to_csv("data.csv",header=True, index=False)
            return df
    else:
        df = pd.read_csv("data.csv")
        return df
    return None

def get_ticket_data():
    if not Path("tickets.csv").exists():
        r = requests.get("https://hackutd2025.eog.systems/api/Tickets")
        
        if r.status_code == 200:
            data = r.json()
            
            df = pd.DataFrame([row for row in data["transport_tickets"]])
        
            df.to_csv("tickets.csv")
            return df
    else:
        df = pd.read_csv("tickets.csv")
        return df
    return None
    
get_ticket_data()
