import sys
import time
from analyzer import TomatoAnalyzer

def main():
    if len(sys.argv) < 2:
        print("Usage: python main.py <image_path> [--debug]")
        sys.exit(1)

    image_path = sys.argv[1]
    debug = "--debug" in sys.argv

    if debug:
        print("=" * 50)
        print("TOMATO COLOR ANALYZER  [debug mode]")
        print("=" * 50)

    start_time = time.perf_counter()
    analyzer = TomatoAnalyzer(debug=debug)
    try:
        analyzer.analyze(image_path)
    finally:
        elapsed = time.perf_counter() - start_time
        print(f"[Time] Finished in {elapsed:.2f}s")

if __name__ == "__main__":
    main()