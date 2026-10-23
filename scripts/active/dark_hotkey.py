"""Windows hotkey sender. Requires: py -m pip install pynput"""
import getpass
import json
import queue
import threading
import time
import urllib.request
import urllib.error
from pynput import keyboard

# Change these keys together to choose another hotkey.
# Tap calls immediately. Holding also resets after HOLD_SECONDS.
HOTKEY = {keyboard.Key.ctrl_l, keyboard.Key.alt_l, keyboard.KeyCode.from_char('d')}
HOLD_SECONDS = 1.0
URL = 'http://127.0.0.1:17812/dark/'


def main():
    token = getpass.getpass('Temporary token from /dark join: ').strip()
    if len(token) != 64 or any(c not in '0123456789abcdef' for c in token):
        raise SystemExit('Expected the 64-character token from /dark join.')
    actions = queue.Queue(maxsize=8)

    def send_loop():
        while True:
            action = actions.get()
            request = urllib.request.Request(URL + action, data=b'', method='POST',
                                             headers={'Authorization': 'Bearer ' + token})
            try:
                with urllib.request.urlopen(request, timeout=5) as response:
                    print(json.load(response)['text'])
            except urllib.error.HTTPError as error:
                print('Caller rejected action:', error.read().decode())
            except Exception as error:
                print('Connection failed; check SSH tunnel:', error)
            # Never retry: the Pi may already have consumed the turn.

    threading.Thread(target=send_loop, daemon=True).start()
    pressed = set()
    active = False
    generation = 0
    lock = threading.Lock()

    def enqueue(action):
        try:
            actions.put_nowait(action)
        except queue.Full:
            print('Too many pending actions; action ignored.')

    def hold_check(current):
        time.sleep(HOLD_SECONDS)
        with lock:
            if active and generation == current:
                enqueue('reset')

    def on_press(key):
        nonlocal active, generation
        if isinstance(key, keyboard.KeyCode) and key.char:
            # Ctrl+D may be reported as ASCII control-D on Windows.
            char = key.char.lower()
            key = keyboard.KeyCode.from_char('d' if char == '\x04' else char)
        with lock:
            pressed.add(key)
            if HOTKEY <= pressed and not active:
                active = True
                generation += 1
                enqueue('next')
                threading.Thread(target=hold_check, args=(generation,), daemon=True).start()

    def on_release(key):
        nonlocal active, generation
        if isinstance(key, keyboard.KeyCode) and key.char:
            char = key.char.lower()
            key = keyboard.KeyCode.from_char('d' if char == '\x04' else char)
        with lock:
            pressed.discard(key)
            if not HOTKEY <= pressed:
                active = False
                generation += 1

    print('Listening: left Ctrl+Alt+D = next; hold 1 second = reset. Close this window to stop.')
    with keyboard.Listener(on_press=on_press, on_release=on_release) as listener:
        listener.join()


if __name__ == '__main__':
    main()
