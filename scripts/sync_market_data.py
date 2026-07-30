"""每日同步中国A股日线：Tushare优先，AKShare备用。"""

from __future__ import annotations

import os
from datetime import date
from typing import Any

import requests


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def fetch_watchlist(base_url: str) -> list[dict[str, Any]]:
    response = requests.get(f"{base_url.rstrip('/')}/api/stocks", timeout=30)
    response.raise_for_status()
    return [item for item in response.json()["stocks"] if item["active"]]


def normalize_tushare_frame(
    frame: Any, symbol: str, adjustment: str
) -> list[dict[str, Any]]:
    if frame is None or frame.empty:
        return []
    frame = frame.sort_values("trade_date")
    return [
        {
            "symbol": symbol,
            "date": f"{str(row.trade_date)[:4]}-{str(row.trade_date)[4:6]}-{str(row.trade_date)[6:8]}",
            "open": float(row.open),
            "high": float(row.high),
            "low": float(row.low),
            "close": float(row.close),
            "volume": float(row.vol),
            "adjustment": adjustment,
            "source": "Tushare",
        }
        for row in frame.itertuples()
    ]


def fetch_tushare(symbol: str, exchange: str, token: str) -> list[dict[str, Any]]:
    import tushare as ts

    ts.set_token(token)
    suffixes = {"SSE": "SH", "SZSE": "SZ", "BSE": "BJ"}
    try:
        suffix = suffixes[exchange]
    except KeyError as exc:
        raise ValueError(f"Unsupported A-share exchange: {exchange}") from exc
    ts_code = f"{symbol}.{suffix}"
    start_date = f"{date.today().year}0101"
    end_date = date.today().strftime("%Y%m%d")
    raw = ts.pro_api().daily(
        ts_code=ts_code,
        start_date=start_date,
        end_date=end_date,
    )
    qfq = ts.pro_bar(
        ts_code=ts_code,
        adj="qfq",
        start_date=start_date,
        end_date=end_date,
    )
    return normalize_tushare_frame(raw, symbol, "raw") + normalize_tushare_frame(
        qfq, symbol, "qfq"
    )


def fetch_akshare(symbol: str) -> list[dict[str, Any]]:
    import akshare as ak

    start_date = f"{date.today().year}0101"
    end_date = date.today().strftime("%Y%m%d")
    rows: list[dict[str, Any]] = []
    for adjustment, value in (("raw", ""), ("qfq", "qfq")):
        frame = ak.stock_zh_a_hist(
            symbol=symbol,
            period="daily",
            start_date=start_date,
            end_date=end_date,
            adjust=value,
        )
        for row in frame.itertuples(index=False):
            rows.append(
                {
                    "symbol": symbol,
                    "date": str(row[0])[:10],
                    "open": float(row[2]),
                    "close": float(row[3]),
                    "high": float(row[4]),
                    "low": float(row[5]),
                    "volume": float(row[6]),
                    "adjustment": adjustment,
                    "source": "AKShare/东方财富",
                }
            )
    return rows


def annual_ranges(prices: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, int], list[dict[str, Any]]] = {}
    for row in prices:
        if row["adjustment"] != "raw":
            continue
        grouped.setdefault((row["symbol"], int(row["date"][:4])), []).append(row)

    now = date.today().isoformat()
    result = []
    for (symbol, year), rows in grouped.items():
        low_row = min(rows, key=lambda item: item["low"])
        high_row = max(rows, key=lambda item: item["high"])
        result.append(
            {
                "symbol": symbol,
                "year": year,
                "low": low_row["low"],
                "high": high_row["high"],
                "lowDate": low_row["date"],
                "highDate": high_row["date"],
                "source": low_row["source"],
                "updatedAt": now,
            }
        )
    return result


def main() -> None:
    base_url = required_env("APP_BASE_URL")
    token = required_env("TUSHARE_TOKEN")
    secret = required_env("SYNC_SECRET")
    stocks = fetch_watchlist(base_url)
    all_prices: list[dict[str, Any]] = []
    used_sources: set[str] = set()

    for stock in stocks:
        try:
            rows = fetch_tushare(stock["symbol"], stock["exchange"], token)
            if not rows:
                raise RuntimeError("Tushare returned no rows")
            used_sources.add("Tushare")
        except Exception as exc:
            print(f"Tushare failed for {stock['symbol']}: {exc}")
            rows = fetch_akshare(stock["symbol"])
            used_sources.add("AKShare")
        all_prices.extend(rows)

    payload = {
        "prices": all_prices,
        "annualRanges": annual_ranges(all_prices),
        "symbols": [stock["symbol"] for stock in stocks],
        "source": "/".join(sorted(used_sources)),
    }
    response = requests.post(
        f"{base_url.rstrip('/')}/api/sync",
        json=payload,
        headers={"Authorization": f"Bearer {secret}"},
        timeout=120,
    )
    response.raise_for_status()
    print(response.json())


if __name__ == "__main__":
    main()
