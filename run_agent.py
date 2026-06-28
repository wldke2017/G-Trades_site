import websocket
import json
import pandas as pd
import pandas_ta as ta
import numpy as np
import requests
import threading
import os
from stable_baselines3 import PPO

# Configurations
APP_ID = '1089'
LOCAL_WEB_URL = "http://localhost:3000/api/ai-update" # Pointing to your local Node server for testing
# RENDER_URL = "https://ghost-trades.site/api/ai-update" # Swap to this later for production

# Load your trained AI brain
MODEL_PATH = "deriv_learning_agent"

print(f"Checking for model at {MODEL_PATH}...")
if not os.path.exists(MODEL_PATH) and not os.path.exists(f"{MODEL_PATH}.zip"):
    print(f"Warning: {MODEL_PATH} not found. Ensure train.py has finished.")

print("Loading trained AI model...")
try:
    model = PPO.load(MODEL_PATH)
except Exception as e:
    print(f"Error loading model: {e}")
    # We'll let it fail if it can't load, as per user's logic flow
    raise e

price_history = []
MAX_HISTORY = 50
virtual_balance = 1000.0  # Mirroring the training account balance

def sync_to_website(action_name, price, rsi, ema, balance):
    """Sends trading metrics to your website backend asynchronously."""
    payload = {
        "action": action_name,
        "price": float(price),
        "rsi": float(rsi),
        "ema": float(ema),
        "balance": float(balance)
    }
    def send():
        try:
            # Short timeout for local testing; increase to 60 for Render production
            response = requests.post(LOCAL_WEB_URL, json=payload, timeout=5)
            if response.status_code == 200:
                print(" -> Website dashboard synced.")
            else:
                print(f" -> Website sync returned status: {response.status_code}")
        except Exception as e:
            print(f" -> Website sync failed: {e}")
                 
    threading.Thread(target=send, daemon=True).start()

def on_open(ws):
    print("--- Connected to Live Deriv Stream ---")
    subscribe_msg = json.dumps({"ticks": "R_100", "subscribe": 1})
    ws.send(subscribe_msg)

def on_message(ws, message):
    global price_history, virtual_balance
    data = json.loads(message)
    
    if 'tick' in data:
        price = data['tick']['quote']
        price_history.append(price)
        
        if len(price_history) > MAX_HISTORY:
            price_history.pop(0)
            
        if len(price_history) >= 15:
            df = pd.DataFrame(price_history, columns=['close'])
            df.ta.rsi(length=14, append=True)
            df.ta.ema(length=9, append=True)
            
            latest_rsi = df['RSI_14'].iloc[-1]
            latest_ema = df['EMA_9'].iloc[-1]
            
            # Format the exact state vector the model expects: [Price, RSI, EMA]
            current_state = np.array([price, latest_rsi, latest_ema], dtype=np.float32)
            
            # Let the AI make its predictive decision based on its training!
            action, _ = model.predict(current_state, deterministic=True)
            
            action_mapping = {0: "BUY RISE", 1: "BUY FALL", 2: "HOLD/WAIT"}
            chosen_action = action_mapping[action]
            
            print(f"Live Price: {price:.2f} | RSI: {latest_rsi:.2f} | AI Decision: {chosen_action}")
            
            # Sync the decision and data straight to your Node.js dashboard
            sync_to_website(chosen_action, price, latest_rsi, latest_ema, virtual_balance)

def on_error(ws, error):
    print(f"Error: {error}")

def on_close(ws, code, msg):
    print(f"--- Connection Closed: {code} {msg} ---")

if __name__ == "__main__":
    socket_url = f"wss://ws.binaryws.com/websockets/v3?app_id={APP_ID}"
    ws = websocket.WebSocketApp(socket_url, on_open=on_open, on_message=on_message, on_error=on_error, on_close=on_close)
    ws.run_forever()
