"""
APEX Racing Scraper — At The Races
Fetches today's UK/IRE racecards and results.
Outputs JSON matching the Racing API format.
"""

import json
import os
import sys
from datetime import datetime
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
os.makedirs(DATA_DIR, exist_ok=True)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36'
}


def fetch_page(url):
    """Fetch page HTML using Playwright for JS-rendered content."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=HEADERS['User-Agent'],
            viewport={'width': 1920, 'height': 1080}
        )
        page = context.new_page()
        page.goto(url, timeout=60000, wait_until='networkidle')
        html = page.content()
        browser.close()
    return html


def parse_racecards(html):
    """Parse ATR racecard page into JSON matching Racing API format."""
    soup = BeautifulSoup(html, 'html.parser')
    races = []

    # ATR racecard structure varies by page type
    # Try mobile racecard first (what the existing code uses)
    race_cards = soup.select('[class*="raceCard"]') or soup.select('[class*="race-card"]')

    for card in race_cards:
        try:
            race_name_el = card.select_one('[class*="raceName"]') or card.select_one('h2') or card.select_one('[class*="title"]')
            race_name = race_name_el.get_text(strip=True) if race_name_el else 'Unknown Race'

            course_el = card.select_one('[class*="course"]') or card.select_one('[class*="meeting"]')
            course = course_el.get_text(strip=True) if course_el else ''

            time_el = card.select_one('[class*="time"]') or card.select_one('[class*="offTime"]')
            off_time = time_el.get_text(strip=True) if time_el else ''

            distance_el = card.select_one('[class*="distance"]')
            distance = distance_el.get_text(strip=True) if distance_el else ''

            going_el = card.select_one('[class*="going"]') or card.select_one('[class*="condition"]')
            going = going_el.get_text(strip=True) if going_el else ''

            runners = []
            runner_rows = card.select('tr[class*="runner"]') or card.select('[class*="horseRow"]') or card.select('tr')

            for row in runner_rows:
                cells = row.find_all('td')
                if len(cells) < 3:
                    continue

                horse_el = row.select_one('[class*="horseName"]') or row.select_one('a')
                horse = horse_el.get_text(strip=True) if horse_el else ''

                odds_el = row.select_one('[class*="price"]') or row.select_one('[class*="odds"]')
                odds = odds_el.get_text(strip=True) if odds_el else ''

                draw_el = row.select_one('[class*="draw"]')
                draw = draw_el.get_text(strip=True) if draw_el else ''

                if horse:
                    runners.append({
                        'horse': horse,
                        'odds': odds,
                        'draw': draw,
                        'position': 0
                    })

            if race_name and runners:
                races.append({
                    'race_id': f'{course}-{off_time}'.replace(' ', '-'),
                    'race_name': race_name,
                    'course': course,
                    'off_time': off_time,
                    'distance_f': distance,
                    'going': going,
                    'region': 'GB',
                    'runners': runners,
                    'scraped_at': datetime.utcnow().isoformat()
                })
        except Exception as e:
            print(f'  Error parsing race card: {e}', file=sys.stderr)

    return races


def fetch_today_racecards():
    """Fetch today's UK/IRE racecards."""
    # Try mobile ATR first (lighter than desktop)
    urls = [
        'https://m.attheraces.com/racecards',
        'https://www.attheraces.com/racecards',
    ]

    for url in urls:
        print(f'Fetching racecards from {url}...')
        try:
            html = fetch_page(url)
            races = parse_racecards(html)
            if races:
                print(f'Found {len(races)} races from {url}')
                return races
            print(f'  No races found at {url}, trying next...')
        except Exception as e:
            print(f'  Error with {url}: {e}', file=sys.stderr)
            continue

    return []


def save_racecards(races):
    """Save racecards in the format the APEX backend expects."""
    output = {
        'racecards': races,
        'updatedAt': datetime.utcnow().isoformat(),
        'loading': False,
        'source': 'atr-scraper'
    }
    path = os.path.join(DATA_DIR, 'live-state.json')
    with open(path, 'w') as f:
        json.dump(output, f, indent=2)
    print(f'Saved {len(races)} races to {path}')
    return path


if __name__ == '__main__':
    import time
    start = time.time()
    races = fetch_today_racecards()
    if races:
        save_racecards(races)
    else:
        print('No races found. The site structure may have changed.')
    print(f'Done in {time.time() - start:.1f}s')
