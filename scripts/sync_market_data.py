"""使用 AKShare 将 A 股日线安全同步到观察台的 D1 数据库。"""

from __future__ import annotations

import argparse
import math
import os
import time
from datetime import date, datetime, timedelta
from typing import Any, Iterable

import requests

FULL_START_DATE = "19900101"
BATCH_SIZE = 450
SOURCE_NAME = "AKShare/东方财富"
FALLBACK_SOURCE_NAME = "AKShare/新浪"


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def request_json(
    method: str,
    url: str,
    *,
    secret: str | None = None,
    payload: dict[str, Any] | None = None,
    timeout: int = 120,
) -> dict[str, Any]:
    headers = {"Authorization": f"Bearer {secret}"} if secret else {}
    response = requests.request(
        method,
        url,
        json=payload,
        headers=headers,
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()


def fetch_watchlist(base_url: str) -> list[dict[str, Any]]:
    payload = request_json("GET", f"{base_url.rstrip('/')}/api/stocks", timeout=30)
    return [item for item in payload["stocks"] if item["active"]]


def chunks(rows: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    for index in range(0, len(rows), size):
        yield rows[index : index + size]


def finite_number(value: Any, *, required: bool = False) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        if required:
            raise ValueError(f"Expected a numeric value, received {value!r}")
        return None
    if not math.isfinite(number):
        if required:
            raise ValueError(f"Expected a finite value, received {value!r}")
        return None
    return number


def normalize_date(value: Any) -> str:
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d")
    return str(value)[:10]


def market_symbol(symbol: str) -> str:
    if symbol.startswith(("4", "8", "92")):
        return f"bj{symbol}"
    if symbol.startswith(("5", "6", "9")):
        return f"sh{symbol}"
    return f"sz{symbol}"


def normalize_history_rows(
    frame: Any,
    symbol: str,
    adjustment: str,
    source: str,
) -> list[dict[str, Any]]:
    if frame is None or frame.empty:
        raise RuntimeError(f"{source} returned no daily rows")
    rows: list[dict[str, Any]] = []
    for record in frame.to_dict("records"):
        close = finite_number(
            record.get("收盘", record.get("close")),
            required=True,
        )
        rows.append(
            {
                "symbol": symbol,
                "date": normalize_date(record.get("日期", record.get("date"))),
                "open": finite_number(record.get("开盘", record.get("open"))),
                "high": finite_number(record.get("最高", record.get("high"))),
                "low": finite_number(record.get("最低", record.get("low"))),
                "close": close,
                "volume": finite_number(
                    record.get("成交量", record.get("volume"))
                ),
                "adjustment": adjustment,
                "source": source,
            }
        )
    return rows


def fetch_akshare_range(
    symbol: str,
    adjustment: str,
    start_date: str,
    end_date: str,
) -> list[dict[str, Any]]:
    import akshare as ak

    adjust_value = "" if adjustment == "raw" else "qfq"
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            frame = ak.stock_zh_a_hist(
                symbol=symbol,
                period="daily",
                start_date=start_date,
                end_date=end_date,
                adjust=adjust_value,
                timeout=30,
            )
            return normalize_history_rows(
                frame,
                symbol,
                adjustment,
                SOURCE_NAME,
            )
        except Exception as exc:  # upstream public endpoints can be intermittent
            last_error = exc
            if attempt < 2:
                time.sleep(2**attempt)
    primary_error = last_error
    for attempt in range(2):
        try:
            frame = ak.stock_zh_a_daily(
                symbol=market_symbol(symbol),
                start_date=start_date,
                end_date=end_date,
                adjust=adjust_value,
            )
            return normalize_history_rows(
                frame,
                symbol,
                adjustment,
                FALLBACK_SOURCE_NAME,
            )
        except Exception as exc:  # independent AKShare/Sina fallback
            last_error = exc
            if attempt == 0:
                time.sleep(2)
    raise RuntimeError(
        "AKShare providers failed: "
        f"Eastmoney={primary_error}; Sina={last_error}"
    )


def incremental_start(last_price_date: str | None) -> str:
    if not last_price_date:
        return FULL_START_DATE
    latest = datetime.strptime(last_price_date, "%Y-%m-%d").date()
    return (latest - timedelta(days=14)).strftime("%Y%m%d")


def selected_stocks(
    stocks: list[dict[str, Any]], mode: str
) -> list[dict[str, Any]]:
    if mode == "pending":
        return [
            stock
            for stock in stocks
            if stock.get("syncStatus") in {"pending", "failed"}
            or not stock.get("lastPriceDateRaw")
            or not stock.get("lastPriceDateQfq")
        ]
    if mode == "full-qfq":
        return [stock for stock in stocks if stock.get("syncStatus") == "ready"]
    return stocks


def post_sync(
    base_url: str,
    secret: str,
    payload: dict[str, Any],
) -> None:
    request_json(
        "POST",
        f"{base_url.rstrip('/')}/api/sync",
        secret=secret,
        payload=payload,
    )


def sync_one_stock(
    stock: dict[str, Any],
    mode: str,
    base_url: str,
    secret: str,
) -> bool:
    symbol = stock["symbol"]
    post_sync(base_url, secret, {"startedSymbols": [symbol]})
    end_date = date.today().strftime("%Y%m%d")
    adjustments = ("qfq",) if mode == "full-qfq" else ("raw", "qfq")
    try:
        all_rows: list[dict[str, Any]] = []
        for adjustment in adjustments:
            key = "lastPriceDateRaw" if adjustment == "raw" else "lastPriceDateQfq"
            start_date = (
                FULL_START_DATE
                if mode in {"pending", "full-qfq"}
                else incremental_start(stock.get(key))
            )
            rows = fetch_akshare_range(
                symbol,
                adjustment,
                start_date,
                end_date,
            )
            all_rows.extend(rows)

        row_batches = list(chunks(all_rows, BATCH_SIZE)) or [[]]
        sources_used = sorted({str(row["source"]) for row in all_rows})
        result_source = " + ".join(sources_used) or SOURCE_NAME
        for index, batch in enumerate(row_batches):
            is_final = index == len(row_batches) - 1
            payload: dict[str, Any] = {"prices": batch}
            if is_final:
                payload["results"] = [
                    {
                        "symbol": symbol,
                        "ok": True,
                        "source": result_source,
                    }
                ]
            post_sync(base_url, secret, payload)
        print(f"{symbol}: synchronized {len(all_rows)} rows ({mode})")
        return True
    except Exception as exc:
        message = str(exc)[:300]
        post_sync(
            base_url,
            secret,
            {"results": [{"symbol": symbol, "ok": False, "error": message}]},
        )
        print(f"{symbol}: failed - {message}")
        return False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode",
        choices=("pending", "daily", "full-qfq"),
        default="daily",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    base_url = required_env("APP_BASE_URL")
    secret = required_env("SYNC_SECRET")
    stocks = selected_stocks(fetch_watchlist(base_url), args.mode)
    if not stocks:
        print(f"No active stocks require the {args.mode} synchronization.")
        return

    success_count = 0
    for index, stock in enumerate(stocks):
        success_count += int(sync_one_stock(stock, args.mode, base_url, secret))
        if index < len(stocks) - 1:
            time.sleep(0.6)

    failure_count = len(stocks) - success_count
    print(
        f"Completed {args.mode}: {success_count} succeeded, "
        f"{failure_count} failed."
    )
    if failure_count:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
