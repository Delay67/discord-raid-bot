"""Generate a cached neural voice clip using Edge's online TTS service."""
import argparse
import asyncio
import edge_tts


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--voice', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--text', required=True)
    args = parser.parse_args()
    await edge_tts.Communicate(args.text, args.voice, rate='+15%').save(args.output)


if __name__ == '__main__':
    asyncio.run(main())
