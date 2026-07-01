import websocket
import json
import pandas as pd
import numpy as np
import requests
import threading
from stable_baselines3 import PPO

# Configurations
APP_ID = '1089'
# LOCAL_WEB_URL = "http://localhost:3000/api/ai-update" # Pointing to your local Node server for testing
RENDER_URL = "https://ghost-trades.site/api/ai-update" # Production URL

# Load your trained AI brain
print("Loading trained AI model...")
model = PPO.load("deriv_learning_agent")

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
            # Increase timeout to 60 for Render production
            response = requests.post(RENDER_URL, json=payload, timeout=60)
            if response.status_code == 200:
                print(" -> Website dashboard synced.")
        except Exception as e:
            print(f" -> Website sync failed: {e}")
                 
    threading.Thread(target=send, daemon=True).start()

def calculate_rsi(series, period=14):
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))

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
            
        if len(price_history) < 15:
            print(f"Collecting initial ticks... ({len(price_history)}/15) - Price: {price:.2f}")
            
        if len(price_history) >= 15:
            df = pd.DataFrame(price_history, columns=['close'])
            
            # Manual RSI calculation
            rsi_series = calculate_rsi(df['close'], period=14)
            latest_rsi = rsi_series.iloc[-1]
            
            # Manual EMA calculation
            ema_series = df['close'].ewm(span=9, adjust=False).mean()
            latest_ema = ema_series.iloc[-1]
            
            # Skip if RSI is NaN (need at least 15 ticks for 14-period RSI)
            if np.isnan(latest_rsi):
                print(f"Collecting data... Tick {len(price_history)}")
                return

            # Format the exact state vector the model expects: [Price, RSI, EMA]
            current_state = np.array([price, latest_rsi, latest_ema], dtype=np.float32)
            
            # Let the AI make its predictive decision based on its training!
            action, _ = model.predict(current_state, deterministic=True)
            
            # FIX: Convert the NumPy array scalar into a standard Python integer
            action = int(action)
            
            action_mapping = {0: "BUY RISE", 1: "BUY FALL", 2: "HOLD/WAIT"}
            chosen_action = action_mapping[action]
            
            print(f"Live Price: {price:.2f} | RSI: {latest_rsi:.2f} | EMA: {latest_ema:.2f} | AI Decision: {chosen_action}")

            # Sync the decision and data straight to your Node.js dashboard
            sync_to_website(chosen_action, price, latest_rsi, latest_ema, virtual_balance)

def on_error(ws, error):
    print(f"Error: {error}")

def on_close(ws, code, msg):
    print("--- Connection Closed ---")

if __name__ == "__main__":
    import time
    socket_url = f"wss://ws.binaryws.com/websockets/v3?app_id={APP_ID}"
    
    print("Starting Live Deriv Stream Connection Loop...")
    while True:
        try:
            ws = websocket.WebSocketApp(
                socket_url,
                on_open=on_open,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close
            )
            # Run the websocket app with a ping interval of 10s and ping timeout of 5s to keep it alive
            ws.run_forever(ping_interval=10, ping_timeout=5)
        except Exception as e:
            print(f"Websocket connection error: {e}")
        
        print("Deriv Live Stream closed/disconnected. Reconnecting in 5 seconds...")
        time.sleep(5)
