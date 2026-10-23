"""Open an SSH tunnel and run the mouse helper in one console."""
import pathlib
import shutil
import socket
import subprocess
import sys
import time

HOST = 'delay@192.168.178.112'
PORT = 17812


def port_open():
    try:
        with socket.create_connection(('127.0.0.1', PORT), timeout=0.3):
            return True
    except OSError:
        return False


def main():
    if not shutil.which('ssh'):
        print('Windows OpenSSH Client was not found. Enable it in Windows Optional Features.')
        return 1
    if port_open():
        print(f'Port {PORT} is already in use. Close the old SSH tunnel or launcher, then try again.')
        return 1

    print(f'Connecting to {HOST}. Enter your Pi password if asked.', flush=True)
    print('If SSH asks about a new host key, verify it before accepting.', flush=True)
    tunnel = subprocess.Popen([
        'ssh', '-N', '-T', '-o', 'ExitOnForwardFailure=yes',
        '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3',
        '-o', 'ConnectTimeout=10',
        '-L', f'127.0.0.1:{PORT}:127.0.0.1:{PORT}', HOST,
    ])
    helper = None
    try:
        deadline = time.monotonic() + 120
        while not port_open():
            if tunnel.poll() is not None:
                print('SSH could not connect. Check the message above, Pi address, and login.')
                return 1
            if time.monotonic() >= deadline:
                print('SSH login timed out. Open the launcher again to retry.')
                return 1
            time.sleep(0.2)

        print('\nTunnel ready. Use /dark join in Discord, then paste its temporary token below.', flush=True)
        print('Press Ctrl+C here to stop the helper and close the tunnel.\n', flush=True)
        helper = subprocess.Popen([
            sys.executable, str(pathlib.Path(__file__).with_name('dark_hotkey.py'))
        ])
        while helper.poll() is None:
            if tunnel.poll() is not None:
                print('\nSSH tunnel disconnected. Restart this launcher to reconnect.', flush=True)
                return 1
            time.sleep(0.2)
        return helper.returncode
    except KeyboardInterrupt:
        print('\nStopping Dark Caller...', flush=True)
        return 0
    finally:
        for process in (helper, tunnel):
            if process is not None and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


if __name__ == '__main__':
    sys.exit(main())
