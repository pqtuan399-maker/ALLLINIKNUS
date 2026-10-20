#!/usr/bin/env python3
"""Read-only NUS kitchen snapshot monitor. GitHub Actions persists data in Git."""
import datetime as dt
import json
import os
import pathlib
import re
import time
import urllib.request
from zoneinfo import ZoneInfo

API = "https://script.google.com/macros/s/AKfycbw0hY2qecbDLcRkzHbP-t3Ed4lkeQBiXycY511OznIVibqN-fqAN0-iptcXGlufBy2POQ/exec"
FILE = pathlib.Path(__file__).parent / "data" / "alerts.json"
TZ = ZoneInfo("Asia/Ho_Chi_Minh")
COLUMNS = ["Trước sáng", "Cắt sáng", "Trước trưa", "Sau trưa", "Cắt trưa", "Trước tối", "Sau tối", "Cắt tối"]


def load_api():
    callback = "NUS_KITCHEN_GH"
    url = API + "?callback=" + callback + "&r=" + str(int(time.time()))
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "NUS-Kitchen-Monitor/1.0"})
            with urllib.request.urlopen(req, timeout=35) as res:
                raw = res.read().decode("utf-8-sig").strip()
            match = re.fullmatch(r"\s*" + callback + r"\s*\(\s*(\{.*\})\s*\)\s*;?\s*", raw, re.S)
            if not match:
                raise ValueError("API did not return expected JSONP callback")
            data = json.loads(match.group(1))
            if not data.get("ok") or not all(isinstance(data.get(k, {}).get("columns"), list) and len(data[k]["columns"]) == 8 for k in ("today", "tomorrow")):
                raise ValueError("Invalid API payload")
            return data
        except Exception:
            if attempt == 2:
                raise
            time.sleep(4 * (attempt + 1))


def roster(day):
    result = {}
    for col, names in enumerate(day["columns"]):
        for raw in names:
            name = " ".join(str(raw).split())
            if name:
                result.setdefault(name, []).append(col)
    for values in result.values():
        values.sort()
    return result


def changes(before, after):
    result = []
    for name in sorted(set(before) | set(after)):
        old, new = list(before.get(name, [])), list(after.get(name, []))
        for index in old[:]:
            if index in new:
                old.remove(index)
                new.remove(index)
        paired = min(len(old), len(new))
        for i in range(paired):
            result.append((name, COLUMNS[old[i]], COLUMNS[new[i]]))
        for i in range(paired, len(old)):
            result.append((name, COLUMNS[old[i]], "ĂN CÙNG"))
        for i in range(paired, len(new)):
            result.append((name, "ĂN CÙNG", COLUMNS[new[i]]))
    return result


def main():
    now = dt.datetime.now(TZ)
    today = now.date().isoformat()
    tomorrow = (now.date() + dt.timedelta(days=1)).isoformat()
    data = load_api()
    current = roster(data["today"])
    upcoming = roster(data["tomorrow"])
    try:
        state = json.loads(FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        state = {}
    # Persist tomorrow's latest snapshot so that a midnight rollover does not lose the baseline.
    previous_day = state.get("day")
    prior_tomorrow = state.get("tomorrow", {}) if state.get("tomorrowDay") == today else None
    previous = state.get("today", {}) if previous_day == today else prior_tomorrow
    if previous is None:
        previous = current
    events = state.get("events", []) if previous_day == today else []
    timestamp = now.isoformat(timespec="seconds")
    if previous_day == today or prior_tomorrow is not None:
        for name, before, after in changes(previous, current):
            events.append({"id": f"{today}-{int(now.timestamp())}-{len(events)+1}",
                           "at": timestamp, "name": name, "from": before, "to": after})
    state = {"schema": 1, "day": today, "updatedAt": timestamp,
             "today": current, "tomorrowDay": tomorrow, "tomorrow": upcoming,
             "events": events[-500:],
             "note": "Lịch sử bắt đầu từ lần GitHub Actions chạy thành công. Thời gian là lúc phát hiện thay đổi, không phải lúc duyệt."}
    FILE.parent.mkdir(parents=True, exist_ok=True)
    FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{timestamp}: day={today}, events={len(state['events'])}, current names={len(current)}")


if __name__ == "__main__":
    main()
