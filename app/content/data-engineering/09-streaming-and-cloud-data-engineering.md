---
module: 9
title: Streaming & Cloud Data Engineering
optional: false
summary: Add the last two pieces of ShopLink's platform. You run Kafka in Docker, replay July's orders as a stream of events, and build a Spark Structured Streaming job that turns them into five-minute revenue in a gold Delta table, with watermarks, deduplication and checkpoints that survive a restart without double counting. Then you move the lake to AWS safely, with a budget alarm first, an S3 bucket, the Glue Data Catalog and Athena, and finish by managing it all as code with OpenTofu, with security and cost built in.
---

# Lesson: Kafka fundamentals

minutes: 55

## Why ShopLink needs a stream

Everything you have built so far is batch: once a day, Airflow extracts what changed, loads it, and Spark rebuilds silver and gold. The sales team's request from Module 1 is different: "a live view of today's revenue". A report that is right at 07:00 tomorrow does not help a sales rep who wants to know, at 15:00, whether Kano has had a good afternoon.

Before building anything, ask what latency the business really needs. "Real time" is one of the most expensive phrases in data. If a number every 15 minutes is enough, a 15-minute Airflow schedule might do. A stream earns its cost when events must be acted on within seconds or minutes, or when the same events feed several systems at once. For ShopLink, the order events feed a live revenue view today and could feed stock alerts and fraud checks tomorrow, so a stream is a reasonable choice.

## Kafka in one table

**Apache Kafka** is the most widely used platform for streams of events. At heart it is a durable, distributed log: producers append events to the end, consumers read from wherever they choose.

| Idea | Meaning | ShopLink example |
|---|---|---|
| Event (record) | A small fact that happened, with a key, a value and a timestamp | Order 109092 was created, key `109092`, value a JSON document |
| Topic | A named stream of events | `shoplink.orders` |
| Partition | A topic is split into ordered partitions, so it can be spread over machines and read in parallel | `shoplink.orders` has 3 partitions |
| Offset | An event's position within its partition: 0, 1, 2 and so on | Partition 2, offset 57 |
| Broker | A Kafka server that stores partitions | Your one `kafka` container |
| Producer | A program that writes events | `streaming/produce_orders.py` |
| Consumer | A program that reads events | `streaming/consume_orders.py`, and later Spark |
| Consumer group | Consumers that share a topic's partitions, each partition read by one member | `revenue-printer` |
| Retention | How long events stay, whether or not anyone read them | 7 days by default |
| Replication factor | How many brokers keep a copy of each partition | 1 on a laptop, 3 in production |

The property that makes Kafka different from a simple queue is that reading does not delete. Events stay for the retention period, and each consumer group keeps its own position. A new consumer can read the whole history, and a consumer with a bug can be fixed and rewound to re-read. You will use exactly that in the next lesson.

## Keys, partitions and ordering

Kafka guarantees order **within a partition**, not across a topic. The producer picks a partition by hashing the event's key, so every event with the same key lands in the same partition, in the order it was sent.

That is why the order events use `order_id` as the key. An order is created, then shipped, then perhaps cancelled. If those three events could land in different partitions, a consumer might see "cancelled" before "created". With the key, every event for order 109092 goes to the same partition and is read in order.

Two practical notes. Adding partitions to a topic later changes which partition a key maps to, so pick a sensible number up front. And Python's `confluent-kafka` client hashes keys differently from Java clients by default; the producer below sets `partitioner` to `murmur2_random` so it matches Java, which matters when Python and Java producers write to the same topic.

## KRaft: no ZooKeeper

Older Kafka tutorials start ZooKeeper alongside Kafka. Since Kafka 3.3, **KRaft** mode lets Kafka manage its own metadata with a built-in controller, and Kafka 4.0 removed ZooKeeper completely. Your broker runs in combined mode: one process is both the broker and the controller. That is fine on a laptop; production clusters run three or more of each.

## Add Kafka to compose.yaml

Kafka needs about 1 GB. For this lesson you only need Kafka, so stop the rest to free memory:

```bash
docker compose stop airflow-apiserver airflow-scheduler airflow-dag-processor airflow-triggerer jupyter spark-worker spark-master
```

Add this service to `compose.yaml`:

```yaml
  kafka:
    image: apache/kafka:3.8.0
    hostname: kafka
    ports:
      - "127.0.0.1:29092:29092"   # the EXTERNAL listener, for scripts on your laptop
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: INTERNAL://:9092,EXTERNAL://:29092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: INTERNAL://kafka:9092,EXTERNAL://localhost:29092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: INTERNAL:PLAINTEXT,EXTERNAL:PLAINTEXT,CONTROLLER:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: INTERNAL
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_LOG_DIRS: /var/lib/kafka/data
      KAFKA_HEAP_OPTS: "-Xms512m -Xmx512m"
      CLUSTER_ID: "4L6g3nShT-eMCtK--X86sw"
    volumes:
      - kafka-data:/var/lib/kafka/data
```

and `kafka-data:` under the top-level `volumes:` section, next to your other named volumes.

The listeners are the part that trips everyone up, so read them slowly:

- **A listener** is a port the broker listens on, with a name. There are three: `INTERNAL` on 9092 for other containers, `EXTERNAL` on 29092 for your laptop, and `CONTROLLER` on 9093 for KRaft's own traffic.
- **An advertised listener** is the address the broker tells clients to use after their first connection. A client connects to any address it knows (the "bootstrap server"), asks for the cluster's metadata, and then reconnects to whatever address the broker advertises. If a container were told `localhost:29092`, it would try to reach itself and fail. So containers such as Spark get `kafka:9092`, and your laptop gets `localhost:29092`.
- `KAFKA_INTER_BROKER_LISTENER_NAME` says which listener brokers use to talk to each other, and the security protocol map says every listener is plain text. Plain text with no authentication is acceptable only because the port is bound to `127.0.0.1`, so nothing outside your machine can reach it.

The image turns every `KAFKA_...` variable into a setting in `server.properties` (`KAFKA_LOG_DIRS` becomes `log.dirs`). Once you set any of them, the image's defaults are no longer used, which is why the replication factors of 1 must be set explicitly: Kafka's default of 3 cannot be met by one broker. `CLUSTER_ID` fixes the ID the storage is formatted with, so the broker finds its data again after a restart, and the named volume keeps topics across `docker compose down`. `KAFKA_HEAP_OPTS` caps the Java heap at 512 MB for a laptop.

Start it and check the log for the line saying the server started:

```bash
docker compose up -d kafka
docker compose logs kafka | grep -i "started"
```

## Topics from the command line

The image ships Kafka's command-line tools in `/opt/kafka/bin`. Create the topic with three partitions, then describe it:

```bash
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:9092 \
  --create --topic shoplink.orders --partitions 3 --replication-factor 1

docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka:9092 \
  --describe --topic shoplink.orders
```

The description lists three partitions, each with leader 1 (your only broker).

## A replay producer

ShopLink's web app does not publish events yet, so you simulate it: a **replay producer** reads the batch 2 extract and publishes each order as a JSON event, in the order the changes happened. Add the client library to `requirements.txt` and install it into your `.venv`:

```text
confluent-kafka>=2.5
```

Save this as `streaming/produce_orders.py`:

```python
"""Replay ShopLink's batch 2 orders into Kafka as JSON events, keyed by order_id.

Run from the repo root:
    python streaming/produce_orders.py --rate 2
    python streaming/produce_orders.py --dry-run
    python streaming/produce_orders.py --late-every 50 --duplicate-every 40
"""
import argparse
import csv
import json
import logging
import time
from pathlib import Path

from confluent_kafka import Producer

log = logging.getLogger("produce_orders")

BATCH_1 = Path("data/shoplink")
BATCH_2 = Path("data/shoplink-batch-2")


def read_csv(path: Path) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def order_totals() -> dict[int, tuple[float, int]]:
    """Net amount and line count per order, from both batches' order lines.

    Duplicate lines are skipped and lines with a quantity of 0 or less are
    dropped, the same rules as the silver layer.
    """
    seen: set[str] = set()
    totals: dict[int, tuple[float, int]] = {}
    for batch in (BATCH_1, BATCH_2):
        for line in read_csv(batch / "order_lines.csv"):
            if line["order_line_id"] in seen or int(line["quantity"]) <= 0:
                continue
            seen.add(line["order_line_id"])
            amount = (int(line["quantity"]) * int(line["unit_price"])
                      * (1 - int(line["discount_pct"]) / 100))
            order_id = int(line["order_id"])
            total, count = totals.get(order_id, (0.0, 0))
            totals[order_id] = (total + amount, count + 1)
    return totals


def build_events() -> list[dict]:
    """One event per batch 2 order row, oldest event_time first."""
    known = {int(r["order_id"]) for r in read_csv(BATCH_1 / "orders.csv")}
    totals = order_totals()
    events = []
    for row in read_csv(BATCH_2 / "orders.csv"):
        order_id = int(row["order_id"])
        amount, line_count = totals.get(order_id, (0.0, 0))
        events.append({
            "event_type": "order_updated" if order_id in known else "order_created",
            "order_id": order_id,
            "customer_id": int(row["customer_id"]),
            "warehouse_id": int(row["warehouse_id"]),
            "order_date": row["order_date"],
            "status": row["status"],  # sent as the app stores it; the stream cleans it
            "channel": row["channel"],
            "event_time": row["updated_at"],
            "net_amount": round(amount, 2),
            "line_count": line_count,
        })
    events.sort(key=lambda e: (e["event_time"], e["order_id"]))
    return events


def hold_back_late(events: list[dict], every: int) -> list[dict]:
    """Move every Nth event to the end of the replay, so it arrives late."""
    if every <= 0:
        return events
    on_time = [e for i, e in enumerate(events, 1) if i % every]
    late = [e for i, e in enumerate(events, 1) if not i % every]
    log.info("holding back %d events to send late", len(late))
    return on_time + late


def send_some_twice(events: list[dict], every: int) -> list[dict]:
    """Repeat every Nth event straight away, as a retrying app without idempotence would."""
    if every <= 0:
        return events
    doubled = []
    for i, e in enumerate(events, 1):
        doubled.append(e)
        if not i % every:
            doubled.append(e)
    log.info("sending %d events twice", len(doubled) - len(events))
    return doubled


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--bootstrap", default="localhost:29092")
    parser.add_argument("--topic", default="shoplink.orders")
    parser.add_argument("--rate", type=float, default=2.0,
                        help="events per second; 0 sends as fast as possible")
    parser.add_argument("--late-every", type=int, default=0,
                        help="send every Nth event at the end, as a late event")
    parser.add_argument("--duplicate-every", type=int, default=0,
                        help="send every Nth event twice, as a duplicate")
    parser.add_argument("--dry-run", action="store_true",
                        help="build the events and print a summary without Kafka")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    events = send_some_twice(hold_back_late(build_events(), args.late_every), args.duplicate_every)
    if args.dry_run:
        created = [e for e in events if e["event_type"] == "order_created"]
        print(f"{len(events)} events: {len(created)} order_created, "
              f"{len(events) - len(created)} order_updated")
        print(json.dumps(events[0], indent=2))
        return

    producer = Producer({
        "bootstrap.servers": args.bootstrap,
        "client.id": "shoplink-replay",
        "enable.idempotence": True,        # no duplicates from producer retries; implies acks=all
        "partitioner": "murmur2_random",   # the same key-to-partition mapping as Java clients
    })
    failed = 0

    def on_delivery(err, msg):
        nonlocal failed
        if err is not None:
            failed += 1
            log.error("delivery failed for key %s: %s", msg.key(), err)

    for n, event in enumerate(events, 1):
        producer.produce(args.topic, key=str(event["order_id"]),
                         value=json.dumps(event), on_delivery=on_delivery)
        producer.poll(0)  # serve delivery callbacks
        if n % 50 == 0:
            log.info("sent %d of %d events (latest event_time %s)", n, len(events), event["event_time"])
        if args.rate > 0:
            time.sleep(1 / args.rate)

    remaining = producer.flush(30)
    if remaining or failed:
        raise SystemExit(f"{failed} events failed and {remaining} were still queued")
    log.info("done: %d events sent to %s", len(events), args.topic)


if __name__ == "__main__":
    main()
```

What the events look like, and why:

- **One event per row of batch 2's `orders.csv`.** The 433 new July orders become `order_created` events; the 132 June orders whose status changed become `order_updated` events. The event time is `updated_at`: the moment the app recorded that state.
- **`net_amount` travels with the event.** The order's lines (from both batches, deduplicated, bad quantities dropped) are summed into one number, so a consumer can compute revenue without looking anything up.
- **`status` is sent raw**, spaces and capitals included, exactly as the app stores it. Cleaning it is the consumer's job, as it was in silver.
- **`produce` is asynchronous.** It puts the event in a buffer and returns at once; the client sends batches in the background. `poll(0)` runs the delivery callbacks, and `flush` waits for everything outstanding before the script exits. A producer that exits without flushing silently loses its last events.
- **`enable.idempotence`** makes the broker discard duplicates caused by the producer's own network retries, and implies `acks=all`: an event counts as delivered only when the broker has written it.

Check it without Kafka first, then send the events at two per second (about five minutes):

```bash
python streaming/produce_orders.py --dry-run
python streaming/produce_orders.py
```

The dry run prints `565 events: 433 order_created, 132 order_updated` and the first event, order 108962, updated at 2026-07-01 08:06:14.

Watch the events arrive with Kafka's console consumer, in a second terminal:

```bash
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server kafka:9092 \
  --topic shoplink.orders --from-beginning --property print.key=true --property print.partition=true
```

Press Ctrl+C to stop it. It printed events grouped by partition, not in one global order, which is the ordering rule in action.

## A consumer, and consumer groups

Save this as `streaming/consume_orders.py`:

```python
"""Read ShopLink order events from Kafka and print a running revenue total.

Run from the repo root:
    python streaming/consume_orders.py --group revenue-printer
"""
import argparse
import json
import logging

from confluent_kafka import Consumer, KafkaException

log = logging.getLogger("consume_orders")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--bootstrap", default="localhost:29092")
    parser.add_argument("--topic", default="shoplink.orders")
    parser.add_argument("--group", default="revenue-printer")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    consumer = Consumer({
        "bootstrap.servers": args.bootstrap,
        "group.id": args.group,
        "auto.offset.reset": "earliest",  # a new group starts from the oldest event
        "enable.auto.commit": False,      # commit only after an event is processed
    })
    consumer.subscribe([args.topic],
                       on_assign=lambda c, parts: log.info("assigned %s", [p.partition for p in parts]))
    revenue, seen = 0.0, 0
    try:
        while True:
            msg = consumer.poll(1.0)
            if msg is None:
                continue
            if msg.error():
                raise KafkaException(msg.error())
            event = json.loads(msg.value())
            status = event["status"].strip().lower()
            if event["event_type"] == "order_created" and status not in ("cancelled", "returned"):
                revenue += event["net_amount"]
            seen += 1
            print(f"p{msg.partition()} offset {msg.offset():>4} key {msg.key().decode()} "
                  f"{event['event_type']:<13} {status:<9} running revenue NGN {revenue:,.0f}")
            consumer.commit(message=msg, asynchronous=False)  # at-least-once
    except KeyboardInterrupt:
        log.info("stopping after %d events", seen)
    finally:
        consumer.close()  # leave the group cleanly so its partitions are reassigned at once


if __name__ == "__main__":
    main()
```

Run it. It logs `assigned [0, 1, 2]` because it is the only member of the `revenue-printer` group, reads all 565 events, and finishes on a running revenue of ₦19,068,681,275: July's net revenue, from the 403 new orders that are not cancelled or returned.

Now start a **second copy** in another terminal with the same `--group`. Kafka rebalances the group: one copy gets partitions `[0, 1]` and the other `[2]` (or a similar split). Each event is now read by exactly one member, which is how consumers scale out. There can never be more active members than partitions; a fourth member of a three-partition group would sit idle. A consumer with a **different** group name reads every event again, independently, because each group keeps its own offsets.

See the offsets Kafka stores for a group:

```bash
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka:9092 \
  --describe --group revenue-printer
```

For each partition you get `CURRENT-OFFSET` (the next offset the group will read), `LOG-END-OFFSET` (the end of the partition) and `LAG`, the difference. Lag is the single most important number for monitoring a stream: steady lag is fine, growing lag means consumers cannot keep up.

## Delivery semantics

When exactly the consumer commits its offset decides what a crash does:

| Guarantee | How you get it | What a crash can cause | ShopLink example |
|---|---|---|---|
| At most once | Commit the offset **before** processing | Events lost: committed but never processed | A running total that silently misses orders |
| At least once | Commit **after** processing (the consumer above) | Events processed twice: processed, then crashed before the commit | The same order added to revenue twice |
| Exactly once | A replayable source, plus a sink that records what it has already written (idempotent or transactional) | Neither, as far as the sink's results go | The next lesson's Spark job writing to Delta |

The consumer above is at least once: if it crashes after printing an event but before committing it, the next run reads that event again and adds it to the running total a second time. Printing is harmless. Adding money to a revenue table is not. At least once plus an **idempotent** sink, one where writing the same thing twice has the same effect as writing it once, is how most real pipelines get exactly-once results. You met idempotency with MERGE in Module 8; the next lesson applies it to a stream.

## Resources

- docs: [Introduction to Kafka](https://kafka.apache.org/intro/) · Apache Kafka · Events, topics, partitions, producers and consumers, from the project itself.
- docs: [Kafka documentation](https://kafka.apache.org/documentation/) · Apache Kafka · The full reference, including every broker, producer and consumer setting.
- docs: [Kafka quickstart](https://kafka.apache.org/quickstart) · Apache Kafka · Topics, producers and consumers from the command line, with the Docker image.
- docs: [confluent-kafka Python client](https://docs.confluent.io/platform/current/clients/confluent-kafka-python/html/index.html) · Confluent · The Producer and Consumer API used in this lesson.
- watch: [Kafka in 100 Seconds](https://www.youtube.com/watch?v=uvb00oaa3k8) · Fireship · 4.28M subscribers · 1.2M views · 36K likes · published 2023-01-10 · checked 2026-09-28 · 3 min
- watch: [Apache Kafka Crash Course](https://www.youtube.com/watch?v=R873BlNVUB4) · Hussein Nasser · 520K subscribers · 490.3K views · 11.2K likes · published 2019-11-27 · checked 2026-09-28 · 78 min

## Practice

1. Add the `kafka` service, create `shoplink.orders` with three partitions, and run the producer once at the default rate.
2. Using `kafka-consumer-groups.sh --describe` after the consumer has read everything, record the `LOG-END-OFFSET` of each partition. What do they add up to, and why?
3. Run two consumers in the `revenue-printer` group. Stop one with Ctrl+C while the other runs, and record what the survivor logs.
4. With both consumers stopped, reset the group to the beginning:
   `docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka:9092 --group revenue-printer --reset-offsets --to-earliest --topic shoplink.orders --execute`
   Run one consumer again. What running total does it end on, and why is that not double counting?
5. Explain in two sentences why the producer uses `order_id` as the key, using the life of one June order in batch 2 as your example.

## Example answer

2. With 565 events on three partitions, the end offsets add up to 565, one per event, because offsets start at 0 in every partition. With the murmur2 partitioner, `order_id` keys spread as 184 events on partition 0, 208 on partition 1 and 173 on partition 2. If your total is 1,130, you ran the producer twice: Kafka happily stores both copies, because it has no idea they are the same orders. Hold on to that thought for the next lesson.

3. The survivor logs a new assignment within a few seconds, for example `assigned [0, 1, 2]` after previously having `[2]`. The group noticed a member left (because `close()` told it, or after the session timeout if the process was killed) and handed its partitions to the remaining member. Any events the stopped consumer had processed but not committed are read again by the survivor, which is at-least-once delivery in action.

4. It ends on ₦19,068,681,275 again. That is not double counting because the running total lives in the consumer's memory and starts from zero on each run; resetting the offsets simply replays the same events into a fresh total. It would be double counting if each run **added** to a total stored in a table. That is the case the next lesson has to handle.

5. A strong answer: "Order 108962 was placed in June and changed status in July; its events must be read in the order they happened, or a consumer could apply an old status over a new one. Keying by `order_id` sends every event for one order to the same partition, and Kafka keeps order within a partition."

# Lesson: Spark Structured Streaming

minutes: 60

## A stream is a table that keeps growing

Spark's streaming API, **Structured Streaming**, asks you to picture the Kafka topic as a table with new rows arriving all the time. You write an ordinary DataFrame query against it: select, filter, group by. Spark runs the query again and again on the rows that have arrived since the last run, and updates the result. Each run is a **micro-batch**. A trigger of 30 seconds means "every 30 seconds, process whatever has arrived".

So most of what you learned in Module 8 carries over. The new ideas are all about time and failure:

| Idea | What it means | ShopLink setting |
|---|---|---|
| Event time | When the event happened, a column in the data | `event_time` from the event |
| Processing time | When Spark happened to see it | The clock in the Spark container |
| Window | A time bucket of event time for aggregating | 5 minutes |
| Watermark | How late an event may be and still be counted; also when Spark can forget old windows | 10 minutes |
| Output mode | Which result rows are written each micro-batch: `append` (final rows only), `update` (changed rows), `complete` (the whole result) | `append` |
| Checkpoint | A folder where Spark records which offsets it has read and the state it holds | `s3a://gold/_checkpoints/order_revenue_5min` |

## Event time and watermarks

Always aggregate on **event time**. If you grouped by processing time, the same order would fall into a different window depending on how busy the cluster was, and a replay of yesterday's events would all land in "now".

Event time brings a problem: events arrive late. A sales rep in a Kano warehouse with no signal logs an order at 10:02, and the app only sends it at 10:19. Spark cannot keep every window open for ever, waiting, or its memory would grow without limit. A **watermark** is the rule for when to stop waiting:

> watermark = the latest event time Spark has seen, minus the delay you allow.

With a 10-minute delay, once Spark has seen an event at 10:16, the watermark is 10:06. Any window that ends at or before 10:06 is final: in append mode it is written to the sink, dropped from memory, and any later event for it is ignored. The delay is a business decision in an engineering costume: too short and real revenue is dropped; too long and the live view lags and Spark holds more state.

Spark updates the watermark between micro-batches, not after every event, so exactly which late events survive depends a little on how they fall into batches. The principle does not change.

## Add the Kafka connector

Spark reads Kafka through a separate package, `spark-sql-kafka-0-10`, whose version must match Spark exactly. In `spark/conf/spark-defaults.conf`, add it to the end of the `spark.jars.packages` line from Module 8, so every Spark session and job gets it:

```text
spark.jars.packages                         io.delta:delta-spark_2.12:3.2.1,org.apache.hadoop:hadoop-aws:3.3.4,com.amazonaws:aws-java-sdk-bundle:1.12.262,org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.3
```

`_2.12` is the Scala version Spark 3.5.3 is built with, and `3.5.3` is the Spark version. The file is mounted, so no rebuild is needed; the first job downloads the new package into the `/tmp/.ivy2` cache.

## The streaming job

Save this as `spark/jobs/stream_order_revenue.py`, next to Module 8's batch jobs so it is mounted into the `jupyter` container. (The laptop-side Kafka scripts live in `streaming/`; Spark jobs live in `spark/jobs/`, where the cluster can see them.)

```python
"""Five-minute ShopLink revenue from the shoplink.orders Kafka topic, into a gold Delta table.

Submit it from the jupyter container; it runs until you stop it with Ctrl+C.
"""
from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F
from pyspark.sql import types as T

GOLD_TABLE = "s3a://gold/order_revenue_5min"
CHECKPOINT = "s3a://gold/_checkpoints/order_revenue_5min"

EVENT_SCHEMA = T.StructType([
    T.StructField("event_type", T.StringType()),
    T.StructField("order_id", T.LongType()),
    T.StructField("customer_id", T.LongType()),
    T.StructField("warehouse_id", T.LongType()),
    T.StructField("order_date", T.StringType()),
    T.StructField("status", T.StringType()),
    T.StructField("channel", T.StringType()),
    T.StructField("event_time", T.StringType()),
    T.StructField("net_amount", T.DoubleType()),
    T.StructField("line_count", T.IntegerType()),
])


def parse_events(raw: DataFrame) -> DataFrame:
    """Kafka rows (binary key and value) to typed order events."""
    return (raw
        .select(F.from_json(F.col("value").cast("string"), EVENT_SCHEMA).alias("e"))
        .select("e.*")
        .withColumn("event_time", F.to_timestamp("event_time", "yyyy-MM-dd HH:mm:ss"))
        .withColumn("status", F.lower(F.trim("status")))
        .filter(F.col("event_time").isNotNull()))  # unparseable events carry no event time


def windowed_revenue(events: DataFrame) -> DataFrame:
    """Net revenue per five-minute event-time window and warehouse, each event counted once."""
    created = F.col("event_type") == "order_created"
    earning = created & ~F.col("status").isin("cancelled", "returned")
    return (events
        .withWatermark("event_time", "10 minutes")
        .dropDuplicatesWithinWatermark(["order_id", "event_time"])  # an event sent twice counts once
        .groupBy(F.window("event_time", "5 minutes"), "warehouse_id")
        .agg(
            F.sum(F.when(earning, F.col("net_amount")).otherwise(0.0)).alias("net_revenue"),
            F.sum(F.when(earning, 1).otherwise(0)).alias("revenue_orders"),
            F.sum(F.when(created, 1).otherwise(0)).alias("orders_created"),
            F.sum(F.when(created, 0).otherwise(1)).alias("status_updates"),
        )
        .select(
            F.col("window.start").alias("window_start"),
            F.col("window.end").alias("window_end"),
            "warehouse_id", "net_revenue", "revenue_orders", "orders_created", "status_updates",
        ))


def main() -> None:
    # Delta, the Kafka connector and the RustFS settings all come from spark-defaults.conf
    spark = SparkSession.builder.appName("shoplink_order_revenue_stream").getOrCreate()

    raw = (spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", "kafka:9092")
        .option("subscribe", "shoplink.orders")
        .option("startingOffsets", "earliest")  # used only on the very first run
        .option("maxOffsetsPerTrigger", 100)     # at most 100 events per micro-batch
        .load())

    query = (windowed_revenue(parse_events(raw))
        .writeStream
        .format("delta")
        .outputMode("append")
        .option("checkpointLocation", CHECKPOINT)
        .trigger(processingTime="30 seconds")
        .start(GOLD_TABLE))
    query.awaitTermination()


if __name__ == "__main__":
    main()
```

Reading it from the top:

- **The Kafka source** gives every record as columns `key` and `value` (binary), plus `topic`, `partition`, `offset`, `timestamp` and `timestampType`. It connects to `kafka:9092`, the INTERNAL listener, because the job runs in a container.
- **`from_json` with an explicit schema.** Never let a stream infer its schema: the first micro-batch would decide the types for ever. An event that does not parse becomes a row of nulls, which the filter removes; in real work you would also write those rows to a quarantine table.
- **`startingOffsets` applies only the first time.** After that, the checkpoint says where to resume. Spark does not use Kafka consumer groups to track progress and does not commit offsets back to Kafka; its checkpoint is the record.
- **`withWatermark` comes before the aggregation, on the same column the window uses.** Spark only uses a watermark to finalise and forget windows when both are true.
- **`dropDuplicatesWithinWatermark`** (new in Spark 3.5) removes an event that arrives twice with the same `order_id` and `event_time`, keeping state only as long as the watermark requires. Module 1 warned that events "sometimes arrive twice"; this is the fix.
- **Conditional sums** count revenue only for `order_created` events whose cleaned status is not cancelled or returned, while still counting status updates. The June updates change no revenue here, because June's revenue was already counted in batch.
- **Append mode** writes each window once, when the watermark passes its end, which is exactly right for a Delta table that other people read: no row is ever rewritten.

## Run it

Streaming needs Kafka, RustFS and Spark. Stop Airflow and start the rest:

```bash
docker compose stop airflow-apiserver airflow-scheduler airflow-dag-processor airflow-triggerer
docker compose up -d kafka rustfs spark-master spark-worker jupyter
```

Shut down any notebook kernel that holds a Spark session. Then submit the job, capping it at two cores so a notebook can still get the other two:

```bash
docker compose exec jupyter /opt/spark/bin/spark-submit \
  --master spark://spark-master:7077 \
  --name shoplink_order_revenue_stream \
  --conf spark.cores.max=2 \
  /home/spark/work/jobs/stream_order_revenue.py
```

It keeps running. If you already ran the producer in the last lesson, the topic holds the 565 events and the first micro-batches read them, 100 at a time. If you ran the producer twice, delete and recreate the topic first (`kafka-topics.sh --delete --topic shoplink.orders`, then create it again) so you start from one clean replay.

While it runs, open http://localhost:4040. The **Structured Streaming** tab shows each query's input rate, processing rate and batch duration, and the latest progress report shows the watermark moving forward.

In a notebook (http://localhost:8888), read the gold table:

```python
from pyspark.sql import SparkSession, functions as F

spark = SparkSession.builder.master("spark://spark-master:7077").appName("gold_check").getOrCreate()
gold = spark.read.format("delta").load("s3a://gold/order_revenue_5min")

gold.orderBy("window_start").show(5, truncate=False)
gold.agg(F.count("*").alias("rows"), F.sum("net_revenue").alias("net_revenue"),
         F.sum("revenue_orders").alias("revenue_orders"),
         F.sum("orders_created").alias("created"), F.sum("status_updates").alias("updates")).show()
```

Once all 565 events are processed you should see **533 rows**, ₦17,769,214,050 of net revenue from 380 revenue orders, 409 created orders and 132 status updates. The first rows are the early July status updates, such as window 08:05 to 08:10 on 1 July for warehouse 2 with two updates and no revenue.

## Where did the rest of July go?

The consumer in the last lesson counted ₦19,068,681,275 from 403 orders. The gold table has ₦1,299,467,225 and 23 revenue orders less. Nothing is lost. The batch 2 extract was taken at 23:00:00 on 31 July, and 24 new orders carry exactly that timestamp. They sit in the window 23:00 to 23:05, and that window can only close when the watermark passes 23:05, which needs an event at 23:15 or later. No such event exists yet, so the window is still open in Spark's state, waiting. In a live system, the first orders on 1 August would close it.

This is the honest behaviour of append mode, and it is worth being able to explain: the live view is always about one watermark delay behind. If the business needs to see open windows too, you would use update mode with a sink that can update rows (for example `foreachBatch` with a Delta MERGE), at the price of rows that change.

## Restart it: exactly once, from the checkpoint

Now prove the job survives a failure. Delete and recreate the topic for a clean start, and remove the gold table and its checkpoint together. The `rustfs-init` service already has the AWS CLI and the lake's keys, so borrow it (or delete the two folders in the RustFS console at http://localhost:9001):

```bash
docker compose run --rm --entrypoint aws rustfs-init --endpoint-url http://rustfs:9000 \
  s3 rm s3://gold/order_revenue_5min --recursive
docker compose run --rm --entrypoint aws rustfs-init --endpoint-url http://rustfs:9000 \
  s3 rm s3://gold/_checkpoints/order_revenue_5min --recursive
```

Then:

1. Start the streaming job.
2. Start the producer at the default rate (about five minutes for the replay).
3. After about two minutes, stop the job with Ctrl+C. The producer keeps sending into Kafka.
4. Wait a minute, then submit the job again with exactly the same command.
5. When the producer finishes and the job has caught up, run the notebook check again, plus a duplicate check:

```python
gold.groupBy("window_start", "warehouse_id").count().filter("count > 1").count()
```

The totals are identical to the uninterrupted run (533 rows, ₦17,769,214,050) and the duplicate check returns 0. Two things made that happen:

- **The checkpoint.** List it with `docker compose run --rm --entrypoint aws rustfs-init --endpoint-url http://rustfs:9000 s3 ls s3://gold/_checkpoints/order_revenue_5min/ --recursive`. `offsets/` has one file per micro-batch, written **before** the batch runs, recording which Kafka offsets it covers. `commits/` has one file per batch, written **after** it succeeds. `state/` holds the open windows and the deduplication keys. On restart, Spark finds the last batch that has an offsets file but no commit, and runs it again with exactly the same offsets.
- **The Delta sink is idempotent.** Open a JSON file in `gold/order_revenue_5min/_delta_log/` (download it from the RustFS console, or `s3 cp` it to the terminal with `-` as the destination). Each streaming commit contains a `txn` entry with the query's ID and the batch number. If Spark replays a batch that had in fact already been written, the sink sees that batch number is already committed and skips it.

That is exactly-once, intuitively: a replayable source (Kafka keeps the events), a record of progress (the checkpoint), and a sink that recognises a repeat (Delta's transaction log). Remove any one of the three and you are back to at-least-once or worse.

Two rules follow. **Treat the checkpoint as part of the table**: back it up, never delete it on its own, and if you ever must reset, delete the table and its checkpoint together and rebuild. And **do not change the query's shape** (its grouping, window or stateful operators) and restart on the old checkpoint: the saved state no longer fits. Adding a filter or changing the trigger is fine; changing the aggregation means a new checkpoint and a new table.

One laptop-specific trap: the Kafka data lives in the `kafka-data` volume. If you ever delete it (`docker compose down -v`), the topic starts again at offset 0 while the checkpoint remembers higher offsets, and the job stops with an error that data was lost (`failOnDataLoss`, true by default). The fix is the same rule: reset the table and checkpoint together.

## Late and duplicate events on purpose

The producer can misbehave on demand. Reset the topic, table and checkpoint, start the job, then run:

```bash
python streaming/produce_orders.py --late-every 50 --duplicate-every 40
```

This holds back every 50th event (11 events) and sends them after all the others, and sends every 40th event twice (14 duplicates). The duplicates change nothing: `dropDuplicatesWithinWatermark` removes them. Most of the late events arrive long after their window closed, and are dropped. In a test run, 9 of the 11 were dropped, leaving 524 rows and ₦17,470,173,175; the exact figure depends on micro-batch boundaries. Silently dropped revenue is the cost of a watermark, which is why real pipelines also send late events somewhere to be counted by the next batch run. For ShopLink, that is already true: the daily batch pipeline loads every order, however late, and `gold/daily_revenue` from Module 8 has the full figure.

## Resources

- docs: [Structured Streaming programming guide (Spark 3.5)](https://spark.apache.org/docs/3.5.8/structured-streaming-programming-guide.html) · Apache Spark · Triggers, event time, watermarks, output modes, deduplication and checkpoints.
- docs: [Structured Streaming and Kafka integration (Spark 3.5)](https://spark.apache.org/docs/3.5.8/structured-streaming-kafka-integration.html) · Apache Spark · Every Kafka source option, the record schema and the package to add.
- docs: [Delta table streaming reads and writes](https://docs.delta.io/delta-streaming/) · Delta Lake · How the transaction log gives streaming writes exactly-once guarantees, and txnAppId and txnVersion for idempotent batch writes.
- read: [Feature deep dive: watermarking in Apache Spark Structured Streaming](https://www.databricks.com/blog/feature-deep-dive-watermarking-apache-spark-structured-streaming) · Databricks · Worked diagrams of windows, watermarks and late data.
- watch: [Spark Structured Streaming with Kafka using PySpark](https://www.youtube.com/watch?v=fFAZi-3AJ7I) · DataMaking · 14.3K subscribers · 22.9K views · 226 likes · published 2019-05-16 · checked 2026-09-28 · 24 min

## Practice

1. Before running anything, work this out by hand. Windows are 5 minutes, the watermark delay is 10 minutes, and assume the watermark moves after every event. Events arrive in this order, as (event time, net amount): (10:01, ₦200,000), (10:03, ₦150,000), (10:07, ₦400,000), (10:02, ₦100,000), (10:16, ₦300,000), (10:04, ₦250,000). For each event, give its window and say whether it is counted.
2. Run the streaming job and the producer, and reproduce the 533 rows and ₦17,769,214,050.
3. Do the restart exercise and show the duplicate check returning 0.
4. Reconcile the stream with the batch layer: using `silver/orders` and `silver/order_lines` from Module 8 (with batch 2 loaded), compute July's net revenue, and show that it equals the gold stream's total plus what is still open.
5. Answer: what would happen if you deleted only the checkpoint folder and restarted the job, and why is that worse than it first looks?

## Example answer

1. The watermark is the latest event time seen, minus 10 minutes.

| Event | Window | Watermark before it arrives | Counted? |
|---|---|---|---|
| 10:01, ₦200,000 | 10:00 to 10:05 | none yet | Yes |
| 10:03, ₦150,000 | 10:00 to 10:05 | 09:51 | Yes |
| 10:07, ₦400,000 | 10:05 to 10:10 | 09:53 | Yes |
| 10:02, ₦100,000 | 10:00 to 10:05 | 09:57 | Yes: late, but within the watermark |
| 10:16, ₦300,000 | 10:15 to 10:20 | 09:57 | Yes. The watermark then moves to 10:06, which closes 10:00 to 10:05 |
| 10:04, ₦250,000 | 10:00 to 10:05 | 10:06 | No: its window is already final, so it is dropped |

The 10:00 to 10:05 window is written once, with ₦450,000 from three orders.

4. In a notebook:

```python
orders = spark.read.format("delta").load("s3a://silver/orders")
lines = spark.read.format("delta").load("s3a://silver/order_lines")
(lines.join(orders, "order_id")
    .filter((F.col("order_date") >= "2026-07-01") & ~F.col("status").isin("cancelled", "returned"))
    .agg(F.countDistinct("order_id"), F.sum("net_amount")).show())
```

This gives 403 orders and ₦19,068,681,275. The stream has ₦17,769,214,050 in closed windows, and the open 23:00 window holds ₦1,299,467,225 from the 23 remaining revenue orders: 17,769,214,050 + 1,299,467,225 = 19,068,681,275. The two paths agree, which is the check a real team would automate. (If your silver table only has batch 1, there are no July rows; run Module 8's silver job for the batch 2 load date first.)

5. Without a checkpoint the job has no record of what it processed, so it starts again from `startingOffsets` (`earliest`) and reprocesses every event still in the topic. It is worse than it looks because in append mode the recomputed windows are simply appended to the existing gold table: nothing fails, the job looks healthy, and every window now appears twice, so revenue doubles until someone reconciles it. The duplicate check from step 3 is the alarm that would catch it, which is a good reason to run it on a schedule.

# Lesson: Data engineering on AWS

minutes: 60

## Why a cloud, and why this one

Everything in your platform runs on open tools that have managed cloud equivalents. RustFS, your local object store, speaks the same S3 API as **Amazon S3**. (MinIO was the usual choice for this until its community Docker images were withdrawn in 2025.) A Delta table's log plays the part that a **catalog** plays in the cloud: a shared record of which tables exist, where their files are and what their columns are. On AWS that is the **Glue Data Catalog**, and **Athena** is a SQL engine that queries files in S3 through it, with no servers to run.

Learn one cloud properly rather than three superficially. The ideas map across: S3 is Azure Data Lake Storage or Google Cloud Storage, Glue Data Catalog is Unity Catalog or BigQuery's metadata, Athena is BigQuery or Synapse serverless SQL.

This lesson uses real AWS. It is cheap for data this small, but cloud bills are real money, so safety comes first.

## Step 1: an account that cannot surprise you

**Sign up** at aws.amazon.com. New accounts choose a **Free plan** or a **Paid plan**, and both get US $100 of credits, with up to $100 more for completing activities. The Free plan never charges you, but it closes the account after six months or when the credits run out, and it only allows selected services. At the time of writing, some learners have found Athena is not enabled on the Free plan. If Athena tells you your account plan does not allow it, upgrade to the Paid plan from the Billing console: remaining credits are applied to bills first, and with the budget below and this lesson's tiny data, the spend is a few cents.

Then, before creating anything else:

1. **Protect the root user.** The email address you signed up with is the root user, which can do anything, including close the account. Add **MFA** to it (an authenticator app on your phone) from the account menu, Security credentials. Then stop using it for daily work.
2. **Create a budget.** In Billing and Cost Management, open Budgets, Create budget, and use the **Monthly cost budget** template with an amount of **$5** and your email address. AWS emails you if your spend exceeds the budget, or is forecast to exceed it. Budgets that only send alerts are free. Also create a **Zero spend budget** from the templates, which emails you as soon as your spending goes beyond the free tier.
3. **Create an everyday identity.** In IAM, create a user `shoplink-admin` with console access and attach two AWS managed policies: `AdministratorAccess` (acceptable for a human on your own learning account, protected by MFA) and `SignInLocalDevelopmentAccess` (lets the AWS CLI borrow your console sign-in). Add MFA to this user too, sign out of root, and sign in as `shoplink-admin` from then on.
4. **Pick a region.** This track uses **eu-west-2 (London)**. It supports every service in this module and is not an opt-in region. You may choose another; use it everywhere you see eu-west-2. Resources in one region are invisible from another, so if something seems to have vanished, check the region selector first.

Companies usually give people access through **IAM Identity Center** rather than IAM users. On a single personal account, Identity Center's account access needs AWS Organizations, and joining Organizations moves a Free plan account to the Paid plan, so this lesson uses an IAM user with MFA and short-lived CLI credentials instead.

## Step 2: the AWS CLI, with short-lived credentials

Install AWS CLI version 2 in your WSL Ubuntu (or macOS/Linux) terminal, following the official instructions for your system. On Linux x86_64:

```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
aws --version     # 2.32.0 or newer is needed for aws login
```

Sign the CLI in with your console identity. `aws login` opens a browser sign-in and caches **temporary** credentials, refreshed automatically for up to 12 hours, so there are no long-lived keys on your disk at all. In WSL, where the terminal may not be able to open a browser, add `--remote` and paste the code it gives you:

```bash
aws login --profile shoplink --remote     # choose region eu-west-2 when asked
export AWS_PROFILE=shoplink
aws sts get-caller-identity
```

`get-caller-identity` prints your account ID and the ARN of `shoplink-admin`. Add `export AWS_PROFILE=shoplink` to the terminal you use for AWS work.

**Keep RustFS and AWS apart.** Your containers get the lake's keys through environment variables named `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (`.env` since Module 5, and the Compose services in Modules 7 and 8). If those two variables are ever exported in your own terminal, they **override** `AWS_PROFILE`, and your commands go to AWS with RustFS's keys and fail, or worse. Do all AWS work with `AWS_PROFILE=shoplink` and no exported `AWS_*` keys. Check with `env | grep ^AWS_`: you should see only `AWS_PROFILE`. If not, `unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY`. If you ever ran `set -a; source .env` in a terminal, open a fresh one for AWS work. Never use those two variables for real AWS. For RustFS, use the `rustfs` profile you created in Module 5 (create it now if you skipped it):

```bash
aws configure --profile rustfs     # only if you do not have the profile yet
# Access key: shoplink   Secret key: shoplink123 (S3_ACCESS_KEY and S3_SECRET_KEY in .env)   Region: us-east-1   Output: json
aws s3 ls --profile rustfs --endpoint-url http://localhost:9000
```

The last command lists `bronze`, `silver` and `gold`: the same CLI, pointed at your laptop instead of AWS. `--profile` on the command line always wins, so the RustFS commands below are safe even with `AWS_PROFILE=shoplink` set.

## Step 3: an S3 bucket for the lake

Bucket names are global across every AWS account, so yours needs something unique in it:

```bash
BUCKET=shoplink-lake-yourname    # replace yourname with your own name, lowercase, no spaces
aws s3api create-bucket --bucket "$BUCKET" --region eu-west-2 \
  --create-bucket-configuration LocationConstraint=eu-west-2
```

New buckets block public access and encrypt objects by default. In the next lesson you make both explicit in code, and add versioning and lifecycle rules.

## Step 4: copy the silver layer up

Copy the silver Delta tables from RustFS to a local folder, then from there to S3. `lake/` is already in your `.gitignore` from Module 2:

```bash
for t in orders order_lines; do
  aws s3 sync "s3://silver/$t" "lake/silver/$t" --profile rustfs --endpoint-url http://localhost:9000
  aws s3 sync "lake/silver/$t" "s3://$BUCKET/silver/$t"
done
aws s3 ls "s3://$BUCKET/silver/" --recursive --summarize --human-readable | tail -2
```

The summary shows a few dozen objects and a few megabytes. Look at what you copied: Parquet files **and** each table's `_delta_log/` folder. That log matters. Module 8's silver job MERGEd batch 2 into `silver/orders`, and a MERGE writes new Parquet files and marks old ones as removed in the log, without deleting them. If you pointed a plain Parquet reader at the folder, it would read the old and new files together and count the 132 changed orders twice. A reader that understands Delta reads the log first and only the current files. Athena understands Delta, so you register these as Delta tables.

## Step 5: a catalog database

The Glue Data Catalog holds databases, which hold tables. Create the database:

```bash
aws glue create-database --database-input '{"Name": "shoplink", "Description": "ShopLink lake tables"}'
```

The catalog stores only metadata: table names, columns, locations. Its first million objects stored and first million requests a month are free.

## Step 6: query with Athena

Replace `shoplink-lake-yourname` with your bucket name everywhere below.

Open the Athena console in eu-west-2, choose the query editor, and in **Settings** set the query result location to `s3://shoplink-lake-yourname/athena-results/` (your bucket). Athena writes every result as a file there. Then run, one statement at a time:

```sql
CREATE EXTERNAL TABLE shoplink.orders
LOCATION 's3://shoplink-lake-yourname/silver/orders/'
TBLPROPERTIES ('table_type' = 'DELTA');

CREATE EXTERNAL TABLE shoplink.order_lines
LOCATION 's3://shoplink-lake-yourname/silver/order_lines/'
TBLPROPERTIES ('table_type' = 'DELTA');
```

There are no column definitions: for Delta tables, Athena reads the schema from the transaction log, and Delta support needs Athena engine version 3 (the default for new workgroups). Now ask a real question:

```sql
SELECT date_trunc('month', o.order_date) AS month,
       count(DISTINCT o.order_id)        AS orders,
       sum(l.net_amount)                 AS net_revenue
FROM shoplink.order_lines l
JOIN shoplink.orders o ON l.order_id = o.order_id
WHERE o.status NOT IN ('cancelled', 'returned')
  AND o.order_date >= DATE '2026-05-01'
GROUP BY 1
ORDER BY 1;
```

With batch 2 loaded in silver, you get May 2026: 334 orders, ₦18,002,646,900; June: 335 orders, ₦17,202,932,600; July: 403 orders, ₦19,068,681,275. July matches the stream reconciliation from the last lesson, and `SELECT count(*) FROM shoplink.orders` returns 9,521 (the app database rejected the 3 orphans in Module 4). Under the results, Athena shows **Data scanned**: note it for the next section.

**A crawler instead?** A Glue **crawler** can scan S3 and create the tables for you, and it understands Delta. It is billed as compute ($0.44 per DPU-hour, per second), while the `CREATE EXTERNAL TABLE` statements above are free DDL. For a handful of tables whose location you know, explicit DDL (or OpenTofu) is simpler, cheaper and reviewable; crawlers earn their keep when many folders appear that nobody wants to register by hand.

## What Athena costs, and how to pay less

Athena charges **US $5 per terabyte of data scanned**, rounded up to the nearest megabyte with a 10 MB minimum per query. DDL statements and failed queries are not charged. ShopLink's silver data is a few megabytes, so every query costs the 10 MB minimum: $0.00005. The habits matter anyway, because the same query on a real lake of 5 TB would cost $25 every time someone runs it.

Two things reduce what a query scans:

- **Columnar formats.** Parquet stores each column separately and compressed. A query that uses 3 of 10 columns reads roughly those 3. CSV and JSON make Athena read everything.
- **Partitions.** If files are stored in folders by a column, such as `order_month=2026-06/`, a query that filters on that column skips the other folders entirely. For Delta tables, Athena also uses the per-file minimum and maximum values in the log to skip files.

See the effect with a partitioned copy, built by Athena itself with `CREATE TABLE AS SELECT` (CTAS):

```sql
CREATE TABLE shoplink.order_lines_by_month
WITH (
  format = 'PARQUET',
  write_compression = 'SNAPPY',
  external_location = 's3://shoplink-lake-yourname/gold/order_lines_by_month/',
  partitioned_by = ARRAY['order_month']
) AS
SELECT l.order_line_id, l.order_id, l.product_id, l.category, l.quantity, l.net_amount,
       o.status, o.warehouse_id,
       date_format(o.order_date, '%Y-%m') AS order_month
FROM shoplink.order_lines l
JOIN shoplink.orders o ON l.order_id = o.order_id;
```

The partition column must come last in the `SELECT`. Now compare **Data scanned** for these two queries:

```sql
SELECT sum(net_amount) FROM shoplink.order_lines_by_month
WHERE status NOT IN ('cancelled', 'returned');

SELECT sum(net_amount) FROM shoplink.order_lines_by_month
WHERE status NOT IN ('cancelled', 'returned') AND order_month = '2026-06';
```

The second reads one of 31 monthly folders, so it scans a small fraction of the first. Both are billed at the 10 MB minimum today; on a big lake, that fraction is the bill.

## Least privilege, first look

Your `shoplink-admin` user can do anything, which is fine for you at a keyboard with MFA. The pipeline that will one day write to this bucket should be able to do almost nothing: read and write objects under its own prefixes in one bucket, read the `shoplink` catalog tables, and run queries in one Athena workgroup. Writing that policy is part of the next lesson.

Leave the bucket, database and tables in place: the next lesson brings them under OpenTofu's management, and removes everything at the end.

## Resources

- docs: [Choosing a plan](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html) · AWS Billing documentation · The Free and Paid plans, credits, and what happens when the Free plan ends.
- docs: [Creating a budget](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-create.html) · AWS Budgets documentation · The monthly and zero spend budget templates.
- docs: [Login for AWS local development using console credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html) · AWS CLI documentation · `aws login`, profiles and the SignInLocalDevelopmentAccess policy.
- docs: [Query Delta Lake tables with Athena](https://docs.aws.amazon.com/athena/latest/ug/delta-lake-tables.html) · Amazon Athena documentation · Delta support, engine version 3 and limitations.
- docs: [AWS Glue Data Catalog: getting started](https://docs.aws.amazon.com/glue/latest/dg/start-data-catalog.html) · AWS Glue documentation · Databases, tables and crawlers.
- docs: [Amazon Athena pricing](https://aws.amazon.com/athena/pricing/) · AWS · The per-terabyte price, with worked examples of how Parquet and partitions cut it.
- watch: [How to set up an AWS billing and budget alert](https://www.youtube.com/watch?v=2XilJFirnWY) · A Cloud Guru · 143K subscribers · 15K views · 181 likes · published 2021-02-28 · checked 2026-09-28 · 7 min
- watch: [AWS Glue 101 | Lesson 1: The Glue Data Catalog And Crawlers](https://www.youtube.com/watch?v=AtG_QD1JAZk) · Johnny Chivers · 27.7K subscribers · 20.2K views · 316 likes · published 2021-04-13 · checked 2026-09-28 · 15 min
- watch: [Query data in S3 using Athena via AWS Glue Data Catalog](https://www.youtube.com/watch?v=GtzV3NVl9yo) · Srce Cde · 20K subscribers · 18.3K views · 168 likes · published 2022-10-30 · checked 2026-09-28 · 8 min

## Practice

1. Complete steps 1 to 6. Take screenshots of the budget page and of the monthly revenue query with its results and "Data scanned".
2. Run the two partition queries and record the data scanned by each. By what factor did the partition filter reduce it?
3. In Athena, compare `SELECT * FROM shoplink.orders LIMIT 10` with `SELECT order_id, status FROM shoplink.orders LIMIT 10`. Which scans less, and why?
4. Explain to a colleague, in three sentences, why copying the silver folder and creating a plain Parquet table over it would give wrong revenue for June 2026.
5. Estimate what ShopLink would pay per month if 20 analysts each ran 30 queries a day that scan the whole silver layer, at today's size and at 2 TB.

## Example answer

2. A typical result is a few hundred KB for the full table and a few tens of KB for the June query, roughly a 20 to 30 times reduction, because the filter reads 1 of 31 partitions. Your exact numbers depend on file sizes; what matters is that you read both from the console and can explain the ratio.

3. The two-column query scans less. Parquet stores each column separately, so Athena reads only `order_id` and `status`; `SELECT *` reads every column. `LIMIT` does not reduce what is scanned as much as people expect, because the engine may read whole files before it stops.

4. "Our silver orders table is a Delta table, and when batch 2 changed 132 June orders, the MERGE wrote new files with the new statuses and marked the old files as removed in the transaction log, without deleting them. A plain Parquet table reads every file in the folder, so it would see both the old and the new version of those orders. June revenue would count them twice, or count cancelled orders as delivered, depending on which rows the query hit."

5. At today's size every query is billed at the 10 MB minimum: 20 × 30 × 22 working days = 13,200 queries × 10 MB = 132 GB, about $0.64 a month. At 2 TB scanned per query it is 13,200 × 2 TB × $5 = $132,000 a month. That is why partitions, columnar formats and a per-query scan limit (next lesson) are not optional at scale, and why analysts would query modelled gold tables rather than silver.

# Lesson: Infrastructure as code with OpenTofu, security and cost

minutes: 60

## Why infrastructure belongs in Git

Everything else in your platform is code in a repository: SQL, Python, DAGs, Spark jobs. The bucket and database you just made are not. You clicked and typed them into existence. When that person leaves, or a setting is changed by hand at 23:00, nobody can say exactly how the platform is configured, and nobody can rebuild it.

**Infrastructure as code (IaC)** describes infrastructure in text files in Git. Changes go through pull requests and review like any other code. The test of whether you really have it: can you destroy the environment and rebuild it from the repository alone?

**Terraform** is the most widely used IaC tool. **OpenTofu** is its open-source fork, maintained under the Linux Foundation since Terraform's licence changed in 2023. The language and commands are almost identical, with `tofu` in place of `terraform`, and it uses the same providers.

## The core ideas

| Idea | Meaning |
|---|---|
| Provider | A plugin that talks to one platform: AWS, Azure, GitHub, Kubernetes and hundreds more |
| Resource | One thing that should exist, such as a bucket |
| Data source | Something OpenTofu reads but does not manage, such as your account ID |
| Variable | An input, so values are not hard-coded |
| Output | A value printed after a run, such as the bucket name |
| State | OpenTofu's record of what it manages and the real IDs, so it can compare code with reality |
| Plan | A preview of what would be created, changed or destroyed |
| Apply | Carrying out the plan |

You describe what should exist, not the steps. OpenTofu works out the steps.

## Install OpenTofu

On Ubuntu (including WSL), the official installer script sets up the package repository:

```bash
curl --proto '=https' --tlsv1.2 -fsSL https://get.opentofu.org/install-opentofu.sh -o install-opentofu.sh
chmod +x install-opentofu.sh
./install-opentofu.sh --install-method deb
rm -f install-opentofu.sh
tofu -version
```

Read a script before you run it with your password; that is the habit the docs recommend too. On macOS, `brew install opentofu`. This lesson needs OpenTofu 1.8 or newer.

## The AWS configuration

Create `infra/aws/` with four files. `versions.tf` pins the tool and the provider:

```hcl
terraform {
  required_version = ">= 1.8"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile

  default_tags {
    tags = {
      project    = "shoplink"
      managed_by = "opentofu"
    }
  }
}
```

`variables.tf`:

```hcl
variable "region" {
  type    = string
  default = "eu-west-2"
}

variable "aws_profile" {
  description = "AWS CLI profile to use. Credentials never go in these files."
  type        = string
  default     = "shoplink"
}

variable "owner" {
  description = "Your name, lowercase: makes the bucket name globally unique."
  type        = string
}

variable "force_destroy" {
  description = "Allow tofu destroy to delete a bucket that still has objects. Keep false."
  type        = bool
  default     = false
}
```

`main.tf`, the lake itself:

```hcl
data "aws_caller_identity" "current" {}

locals {
  bucket     = "shoplink-lake-${var.owner}"
  account_id = data.aws_caller_identity.current.account_id
}

# ---- the lake bucket
resource "aws_s3_bucket" "lake" {
  bucket        = local.bucket
  force_destroy = var.force_destroy
}

resource "aws_s3_bucket_public_access_block" "lake" {
  bucket                  = aws_s3_bucket.lake.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "lake" {
  bucket = aws_s3_bucket.lake.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"   # SSE-S3: encrypted at rest with keys AWS manages, at no cost
    }
  }
}

resource "aws_s3_bucket_versioning" "lake" {
  bucket = aws_s3_bucket.lake.id
  versioning_configuration {
    status = "Enabled"   # an overwritten or deleted object can be recovered
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "lake" {
  bucket     = aws_s3_bucket.lake.id
  depends_on = [aws_s3_bucket_versioning.lake]

  rule {
    id     = "expire-athena-results"
    status = "Enabled"
    filter {
      prefix = "athena-results/"
    }
    expiration {
      days = 7
    }
  }

  rule {
    id     = "tidy-old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30   # versioning keeps old copies; do not keep them for ever
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# ---- catalog and query engine
resource "aws_glue_catalog_database" "shoplink" {
  name        = "shoplink"
  description = "ShopLink lake tables"
}

resource "aws_athena_workgroup" "shoplink" {
  name          = "shoplink"
  force_destroy = true   # query history only; the data lives in S3

  configuration {
    enforce_workgroup_configuration    = true
    publish_cloudwatch_metrics_enabled = true
    bytes_scanned_cutoff_per_query     = 1073741824   # cancel any query that scans more than 1 GB

    engine_version {
      selected_engine_version = "Athena engine version 3"
    }

    result_configuration {
      output_location = "s3://${aws_s3_bucket.lake.bucket}/athena-results/"
      encryption_configuration {
        encryption_option = "SSE_S3"
      }
    }
  }
}

# ---- least privilege for the pipeline
data "aws_iam_policy_document" "pipeline" {
  statement {
    sid       = "ListTheLakeBucket"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.lake.arn]
  }

  statement {
    sid     = "ReadWriteLakeObjects"
    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"]
    resources = [
      "${aws_s3_bucket.lake.arn}/bronze/*",
      "${aws_s3_bucket.lake.arn}/silver/*",
      "${aws_s3_bucket.lake.arn}/gold/*",
      "${aws_s3_bucket.lake.arn}/athena-results/*",
    ]
  }

  statement {
    sid = "ReadTheShopLinkCatalog"
    actions = [
      "glue:GetDatabase", "glue:GetDatabases", "glue:GetTable", "glue:GetTables",
      "glue:GetPartition", "glue:GetPartitions", "glue:BatchGetPartition",
    ]
    resources = [
      "arn:aws:glue:${var.region}:${local.account_id}:catalog",
      "arn:aws:glue:${var.region}:${local.account_id}:database/${aws_glue_catalog_database.shoplink.name}",
      "arn:aws:glue:${var.region}:${local.account_id}:table/${aws_glue_catalog_database.shoplink.name}/*",
    ]
  }

  statement {
    sid = "QueryInTheShopLinkWorkgroup"
    actions = [
      "athena:StartQueryExecution", "athena:GetQueryExecution", "athena:GetQueryResults",
      "athena:StopQueryExecution", "athena:GetWorkGroup",
    ]
    resources = [aws_athena_workgroup.shoplink.arn]
  }
}

resource "aws_iam_policy" "pipeline" {
  name        = "shoplink-lake-pipeline"
  description = "What the ShopLink pipeline may do in the lake, and nothing else"
  policy      = data.aws_iam_policy_document.pipeline.json
}
```

`outputs.tf`:

```hcl
output "bucket" {
  value = aws_s3_bucket.lake.bucket
}

output "athena_workgroup" {
  value = aws_athena_workgroup.shoplink.name
}

output "pipeline_policy_arn" {
  value = aws_iam_policy.pipeline.arn
}
```

And `infra/aws/terraform.tfvars`, which holds no secrets and can be committed:

```hcl
owner = "yourname"   # your own name, lowercase, no spaces
```

Things to notice:

- **One resource per concern.** Since version 4 of the AWS provider, a bucket's encryption, versioning, public access block and lifecycle are separate resources that point at the bucket. Each shows up separately in a plan, so a reviewer sees exactly which setting changes.
- **No credentials anywhere.** The provider uses the `shoplink` profile, whose temporary credentials came from `aws login`. There is nothing in these files worth stealing. If `tofu plan` reports that it found no valid credentials, your provider version may not read `aws login` sessions yet. Add a second profile to `~/.aws/config` that asks the CLI for them, and use it with `tofu plan -var aws_profile=shoplink-tofu`:

  ```text
  [profile shoplink-tofu]
  credential_process = aws configure export-credentials --profile shoplink --format process
  region = eu-west-2
  ```
- **Cost controls are code too.** Athena results expire after 7 days, old object versions after 30, and the workgroup cancels any query that would scan more than 1 GB (the minimum allowed is 10 MB).
- **`aws_iam_policy_document`** builds the policy JSON from HCL, so OpenTofu checks the syntax and fills in the real ARNs. The policy is not attached to anything yet; in production you would attach it to the role the pipeline runs as, such as an EC2 instance role or an ECS task role, never to a person.

## Import what already exists

`tofu init` downloads the provider and writes `.terraform.lock.hcl`, which records its exact version. Then plan:

```bash
cd infra/aws
tofu init
tofu fmt
tofu validate
tofu plan
```

The plan wants to create the bucket and the `shoplink` database. They already exist from the last lesson, so the apply would fail with "BucketAlreadyOwnedByYou" and "AlreadyExistsException". This is a real situation at work: infrastructure somebody created by hand that you now want managed as code. **Import** it into the state:

```bash
tofu import aws_s3_bucket.lake shoplink-lake-yourname
tofu import aws_glue_catalog_database.shoplink "$(aws sts get-caller-identity --query Account --output text):shoplink"
tofu plan -out=tfplan
```

A Glue database's import ID is `account-id:name`. Now the plan reads "6 to add": the four bucket settings, the workgroup and the policy (it may also show small in-place updates, such as the database description or tags). Read every line of it, then apply exactly that plan:

```bash
tofu apply tfplan
tofu output
```

Applying a saved plan file means you apply exactly what you reviewed, even if the code or the account changed in between. Run `tofu plan` again: "No changes. Your infrastructure matches the configuration."

Switch the Athena console to the `shoplink` workgroup and rerun the monthly query from the last lesson. The Athena tables you created with DDL live in the database but are not in OpenTofu's code, which is a common, deliberate split: OpenTofu manages the containers (bucket, database, workgroup, permissions) and the pipeline manages the tables inside them. (If you wanted them in code as well, the provider has `aws_glue_catalog_table`.)

## State: what it is and where it lives

The state file, `terraform.tfstate`, maps each resource in your code to a real ID. It can contain sensitive values, and it must never be edited by hand. Rules:

| File | Commit it? | Why |
|---|---|---|
| `*.tf`, `terraform.tfvars` without secrets | Yes | This is the code |
| `.terraform.lock.hcl` | Yes | Everyone gets the same provider version |
| `.terraform/` | No | Downloaded providers; `tofu init` recreates them |
| `terraform.tfstate`, `terraform.tfstate.backup`, `tfplan` | No | State and plans can contain secrets; your `.gitignore` already excludes `*.tfstate*`. Add `tfplan` to it |

Local state is fine for one person. A team keeps state in a **remote backend** so everyone uses the same copy and two applies cannot run at once. On AWS the usual choice is the S3 backend, in a separate bucket created once by hand or by a small bootstrap configuration:

```hcl
terraform {
  backend "s3" {
    bucket       = "shoplink-tofu-state-yourname"
    key          = "lake/terraform.tfstate"
    region       = "eu-west-2"
    use_lockfile = true   # a lock object in the bucket stops two applies at once
  }
}
```

Other options: OpenTofu can also **encrypt** state client-side before it is written anywhere (the `encryption` block, an OpenTofu feature Terraform does not have), and managed services such as Spacelift or Terraform Cloud-compatible backends store and lock it for you. For this module, local state is enough.

## Security, all in one place

- **Secrets.** No keys in code, commits, READMEs or chat. Humans use short-lived credentials (`aws login`, or Identity Center at work); pipelines use roles, never access keys. Locally, passwords live in `.env`, which is git-ignored. If a key is ever committed, deleting it in the next commit is not enough: Git history keeps it and bots scan public GitHub within minutes. Revoke it and issue a new one straight away, and turn on GitHub secret scanning.
- **Least privilege.** Every identity gets only what its job needs, scoped to specific resources, as in the pipeline policy. Start narrow and add a permission when something fails with AccessDenied, rather than starting with `*`.
- **Encryption and no public access.** Explicit in code, so a review would catch anyone switching them off.
- **Personal data.** ShopLink's customers table has names and emails, covered by Nigeria's Data Protection Act 2023. Keep raw personal data in restricted prefixes and schemas, and give analysts modelled marts without it.

## Cost, all in one place

Storage is cheap: S3 Standard costs a few US cents per GB per month, and the whole ShopLink lake is well under 1 GB. Bills grow with **compute and scans**: Athena bytes scanned, crawler DPU-hours, and anything left running. The habits that keep a bill small:

1. A budget with email alerts, created before anything else.
2. Lifecycle rules, so results, raw landings and old versions expire.
3. A per-query scan limit on the Athena workgroup.
4. Parquet, partitions, and queries on modelled gold tables rather than raw data.
5. Tags on everything (`default_tags`), so Cost Explorer can show what the ShopLink project costs.
6. **Destroy what you are not using.**

## Clean up

When your project screenshots are done, remove everything. Because the bucket is versioned, "delete all objects" leaves old versions behind, so an ordinary `tofu destroy` would fail on a non-empty bucket. That refusal is a safety feature. Deleting a lake should take a deliberate change that a reviewer can see, not a typo:

```bash
tofu apply -var force_destroy=true    # records the setting in state first
tofu destroy -var force_destroy=true
```

`force_destroy` only takes effect after an apply has recorded it, which is why there are two commands. The workgroup, policy, database (and the Athena tables in it) and the bucket with every version are removed. Then, in the console, check S3, Glue and Athena in eu-west-2 are empty, and look at Billing's **Bills** page over the next day: it should show a few cents at most. Keep the budget; it costs nothing.

## Resources

- docs: [What is OpenTofu?](https://opentofu.org/docs/intro/) · OpenTofu · The core workflow and how it relates to Terraform.
- docs: [Installing OpenTofu on .deb-based Linux](https://opentofu.org/docs/intro/install/deb/) · OpenTofu · The installer script used above, and the manual alternative.
- docs: [Command: import](https://opentofu.org/docs/cli/import/) · OpenTofu · Bringing existing infrastructure under management.
- docs: [S3 backend](https://opentofu.org/docs/language/settings/backends/s3/) · OpenTofu · Remote state in S3, with `use_lockfile` locking.
- docs: [AWS provider: aws_s3_bucket_lifecycle_configuration](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_lifecycle_configuration) · Terraform Registry · Rules, filters and expiration, as used in `main.tf`.
- docs: [AWS provider: aws_athena_workgroup](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/athena_workgroup) · Terraform Registry · Result location, engine version and the per-query scan cutoff.
- docs: [Security best practices in IAM](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) · AWS IAM documentation · Temporary credentials, MFA, least privilege and root user protection.
- watch: [Terraform in 100 Seconds](https://www.youtube.com/watch?v=tomUWcQ0P3k) · Fireship · 4.28M subscribers · 821.6K views · 31K likes · published 2021-07-28 · checked 2026-09-28 · 2 min
- watch: [Install and use OpenTofu](https://www.youtube.com/watch?v=a-lGAp9vWaQ) · Mathis Van Eetvelde · 2.58K subscribers · 13.1K views · 176 likes · published 2023-09-21 · checked 2026-09-28 · 6 min
- watch: [Terraform Course - Automate your AWS cloud infrastructure](https://www.youtube.com/watch?v=SLB_c_ayRMo) · freeCodeCamp.org · 11.9M subscribers · 2.2M views · 28.8K likes · published 2020-07-16 · checked 2026-09-28 · 141 min

## Practice

1. Write the four files, import the bucket and database, and apply until `tofu plan` reports no changes. Save the plan output.
2. Change the bronze lifecycle: add a third rule that expires objects under `bronze/` after 90 days. Plan it and paste the plan. How many resources change, and is it "update in-place" or "replace"?
3. Someone turns off "Block public access" on the bucket in the console. Run `tofu plan`. What does it show, and what does `tofu apply` do?
4. Read the pipeline policy and answer: could a pipeline with only this policy (a) read `s3://shoplink-lake-yourname/silver/orders/...`, (b) delete the bucket, (c) run a query in the `primary` workgroup, (d) read a Glue table in another database? One sentence each.
5. Your `tofu apply` works but a colleague's fails on the same code. Name two likely causes.

## Example answer

2. The new rule goes inside the existing `aws_s3_bucket_lifecycle_configuration`, because a bucket can have only one lifecycle configuration:

```hcl
  rule {
    id     = "expire-raw-landings"
    status = "Enabled"
    filter {
      prefix = "bronze/"
    }
    expiration {
      days = 90
    }
  }
```

The plan shows `aws_s3_bucket_lifecycle_configuration.lake will be updated in-place` and "0 to add, 1 to change, 0 to destroy". Nothing is replaced, and no objects are touched until they reach 90 days.

3. The plan shows drift: `aws_s3_bucket_public_access_block.lake will be updated in-place`, with the four settings changing from `false` back to `true`. `tofu apply` puts them back. This is one of IaC's quiet benefits: a regular `tofu plan` (for example in CI every morning) is a drift detector.

4. (a) Yes: `s3:GetObject` is allowed on `silver/*`. (b) No: there is no `s3:DeleteBucket`, only object actions under four prefixes. (c) No: the Athena actions are allowed only on the `shoplink` workgroup's ARN. (d) No: Glue access is scoped to the `shoplink` database and its tables.

5. Likely causes: the lock file was not committed, so they have a different provider version; each of you has a separate local state file, so their state does not know about resources yours created; someone changed a resource by hand, so reality drifted; or their `shoplink` profile's session has expired (`aws login` again) or points at a different account or region. Any two, explained, is a full answer.

# Quiz

passing_score: 70

### ShopLink's producer sends every event for an order with the order_id as the key. What does that guarantee?

- [ ] Every consumer in every group receives each event exactly once
- [x] All events for one order land in the same partition, so they are read in the order they were sent
- [ ] Events are spread evenly across all partitions regardless of the key
- [ ] Kafka removes duplicate events with the same key

> Kafka keeps order within a partition, and the key decides the partition. Keying by order_id keeps each order's events in sequence; it does not deduplicate or balance them.

### A consumer processes each event, adds its amount to a revenue table, and then commits the offset. It crashes after writing to the table but before committing. What happens when it restarts?

- [ ] The event is lost, because Kafka deleted it once it was read
- [ ] Nothing: Kafka knows the table was updated
- [x] It reads the event again and, unless the table write is idempotent, adds the amount a second time
- [ ] The consumer group is deleted and must be recreated

> Committing after processing is at-least-once delivery: nothing is lost, but work done before the crash is repeated. Exactly-once results need an idempotent or transactional sink, such as Delta with Spark's checkpoint.

### In the streaming job, a 5-minute window uses append mode with a 10-minute watermark. When is the window for 10:00 to 10:05 written to the gold table?

- [ ] As soon as the first event for it arrives
- [ ] Every micro-batch, with the latest partial total
- [x] Once, after the watermark (latest event time seen minus 10 minutes) passes 10:05
- [ ] Only when the streaming job is stopped

> In append mode each window is written once, when it is final. That is why ShopLink's last window of July, 23:00 to 23:05, stays open until a later event moves the watermark past it.

### An analyst's Athena query over the silver layer scans 2 TB each time. Which change reduces the cost the most without losing any data?

- [ ] Adding LIMIT 100 to the query
- [ ] Converting the data to CSV so it is easier to read
- [x] Storing the data as Parquet partitioned by month, and filtering on the partition column
- [ ] Running the query in a different AWS region

> Athena charges per byte scanned. Columnar Parquet lets it read only the columns used, and partitions let it skip whole folders. LIMIT does not reliably reduce the scan, and CSV makes it worse.

### Which files from infra/aws should be committed to the shoplink-data-platform repository?

- [ ] Everything, including terraform.tfstate, so colleagues can see what exists
- [x] The .tf files, terraform.tfvars without secrets, and .terraform.lock.hcl, but not terraform.tfstate or .terraform/
- [ ] Only terraform.tfstate, because it records the real infrastructure
- [ ] Nothing: infrastructure code should stay on the laptop that ran it

> The code and the lock file belong in Git. State can contain secrets and belongs in a locked remote backend for teams; .terraform/ is recreated by tofu init.

# Project: ShopLink streaming revenue and cloud lake

max_score: 100

## Brief

ShopLink's sales team wants a live view of revenue, and leadership wants the lake to run in the cloud without surprise bills. Add both to your platform: a Kafka stream of order events turned into five-minute revenue in a gold Delta table by Spark Structured Streaming, proven to survive a restart without double counting; and an AWS lake (S3 bucket, Glue database, Athena workgroup and a least-privilege IAM policy) managed with OpenTofu, with the silver layer queryable in Athena and a note on what it cost.

Work in your `shoplink-data-platform` repository on a branch called `feature/streaming-and-cloud`.

## Deliverables

1. **Kafka.** A `kafka` service in `compose.yaml` (KRaft, `apache/kafka:3.8.0`, INTERNAL `kafka:9092` and EXTERNAL `localhost:29092` listeners, a named volume). The command you used to create `shoplink.orders` with three partitions, in the README.
2. **Producer and consumer.** `streaming/produce_orders.py` publishing batch 2 orders as JSON events keyed by `order_id`, with an idempotent producer; `streaming/consume_orders.py` committing offsets after processing. `confluent-kafka` added to `requirements.txt`.
3. **Streaming job.** `spark/jobs/stream_order_revenue.py` reading the topic with an explicit schema, a watermark, deduplication and a 5-minute window, writing to `s3a://gold/order_revenue_5min` in append mode with a checkpoint on RustFS. The Kafka connector added to `spark-defaults.conf`.
4. **Evidence for the stream.** In `docs/streaming.md`: the gold table's row count and total after one full replay; the restart exercise with the duplicate check returning 0; the late-and-duplicate run with your numbers and an explanation of what was dropped and why; and the reconciliation of the stream against silver for July.
5. **OpenTofu.** `infra/aws/` with the bucket (versioning, encryption, public access block, lifecycle rules), the Glue database, the Athena workgroup with a scan limit, and the pipeline IAM policy. `.terraform.lock.hcl` committed; no state, plan files or credentials committed.
6. **Athena evidence.** Screenshots in `docs/` of: the budget page; the `tofu plan` showing no changes after apply; the monthly revenue query in the `shoplink` workgroup with its results and data scanned; and the two partition queries with their data scanned.
7. **COST.md.** What you created, what each piece costs (storage, Athena per query, anything else), what your Billing page showed, the cost controls you put in place, and proof of clean-up (the `tofu destroy` summary).

## How to submit

Push the branch and open a pull request into `main`. Paste the pull request link into the submission form, with a one-line note on which part you found hardest. If you would like a second opinion before you submit, share your `docs/streaming.md` for peer review on 1501 Learn.

## Grading guide

| Criterion | Points |
|---|---|
| Kafka service correctly configured (both listeners, KRaft, volume); topic created with three partitions | 10 |
| Producer keyed by order_id with idempotence and a flush; consumer commits after processing; requirements updated | 15 |
| Streaming job: explicit schema, event-time watermark before the aggregation, deduplication, 5-minute window, append mode, checkpoint on RustFS | 20 |
| Stream evidence: correct totals, restart with no duplicate windows, late and duplicate events explained, reconciliation with silver | 15 |
| OpenTofu: bucket with versioning, encryption, public access block and lifecycle; Glue database; workgroup with scan limit; scoped IAM policy; lock file committed, no state or secrets | 20 |
| Athena evidence: budget, clean plan, queries with data scanned, partition comparison | 10 |
| COST.md: accurate costs, cost controls explained, clean-up proven | 10 |
