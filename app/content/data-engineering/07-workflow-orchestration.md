---
module: 7
title: Workflow Orchestration
optional: false
summary: Run Apache Airflow 3 in your own Docker Compose stack and turn the Module 6 pipeline into a scheduled, observable workflow. You write DAGs with the TaskFlow API, learn how Airflow 3 thinks about schedules, logical dates and backfills, use connections, variables, XCom, sensors and pools properly, add retries, failure callbacks and deadline alerts, and run dbt as part of the flow. The project is the shoplink_daily_ingest DAG, backfilled for a date range.
---

# Lesson: Airflow concepts and setup

minutes: 60

## Why you need an orchestrator

At the end of Module 6 your pipeline had several steps: extract from the app database, the supplier file and the orders API, validate, load, then rebuild the dbt models. You ran them by hand, in order, with a load date. That works until the day you forget, or the API is down at 02:00, or someone asks you to reload the first week of September.

An **orchestrator** does four jobs for you:

1. **Order.** It runs each step only after the steps it depends on have succeeded.
2. **Schedule.** It starts the workflow at the right time, every time, with the right date.
3. **Recovery.** It retries steps that fail for temporary reasons, and lets you rerun any step or any past date safely.
4. **Visibility.** It records every run, keeps every log, and tells someone when a run fails or is late.

Cron can do the second job. It cannot do the other three, which is why teams outgrow it. Apache Airflow is the most widely used open-source orchestrator. Dagster and Prefect are popular alternatives, and cloud platforms have their own (AWS Step Functions, Azure Data Factory). The ideas in this module carry across all of them.

## The vocabulary

| Term | Meaning |
|---|---|
| DAG | Directed acyclic graph: one workflow, as tasks plus the dependencies between them. "Acyclic" means no loops |
| Task | One step in a DAG, such as "extract orders from the API" |
| Operator | A reusable template for a kind of task: `BashOperator` runs a shell command, `SQLExecuteQueryOperator` runs SQL |
| Dag run | One execution of a DAG, for one logical date |
| Task instance | One execution of one task inside one Dag run. It has a state: queued, running, success, failed, up_for_retry, upstream_failed, skipped |
| Logical date | The date a run is "for". Your tasks use it as the load date |
| Schedule | When runs are created: a cron expression, a preset such as `@daily`, or a timetable |

## How Airflow 3 is built

Airflow is not one program. It is several services that share a metadata database:

| Component | Job |
|---|---|
| Metadata database | Stores DAG definitions, runs, task states, connections and variables. You use a database called `airflow` on your existing `postgres` service |
| DAG processor | Reads the Python files in `dags/`, and stores the parsed DAGs in the database. New in Airflow 3 as a separate service |
| Scheduler | Decides which Dag runs and task instances should happen now, and hands ready tasks to the executor |
| Executor | Runs the tasks. `LocalExecutor` runs each task as a process inside the scheduler container, which is ideal on one machine |
| API server | Serves the web UI and the REST API on port 8080, and the Task Execution API that running tasks report back to |
| Triggerer | Runs "deferred" waits (for example a sensor waiting for a file) without holding a worker slot. You meet it in lesson 4 |

One change from Airflow 2 matters when you read older tutorials: in Airflow 3, task code no longer talks to the metadata database directly. Tasks talk to the API server through the Task SDK (`airflow.sdk`), which is why imports in this module look like `from airflow.sdk import dag, task`. Many blog posts still show Airflow 2 imports such as `from airflow.decorators import dag`. Prefer the Airflow 3 forms.

## Adding Airflow to your compose.yaml

Airflow publishes an official `docker-compose.yaml` for each release. It uses the CeleryExecutor with Redis, which is more than one laptop needs. You follow the same pattern with three changes: `LocalExecutor` instead of Celery (so no Redis and no worker service), the existing `postgres` service instead of a new one, and a small custom image so tasks can import your `pipelines/` package and run dbt.

This module uses Airflow **3.3.2** with Python 3.11. Airflow needs about 4 GB of memory on top of what you already run, so the 16 GB recommendation from Module 2 applies from now on.

**Step 1: check the metadata database.** The init script from Module 2 already created `airflow` next to `shoplink_app` and `warehouse`. Confirm it from the repo root:

```bash
cd ~/shoplink-data-platform
docker compose up -d postgres
docker compose exec postgres psql -U shoplink -d postgres -c "\l"
```

If `airflow` is missing from the list (your volume is older than the init script, which only runs on an empty volume), create it:

```bash
docker compose exec postgres createdb -U shoplink airflow
```

**Step 2: folders and secrets.** Airflow needs a few folders, and it must run as your own user so files it writes in `logs/` and `dags/` are yours:

```bash
mkdir -p dags logs airflow/config airflow/plugins
echo "AIRFLOW_UID=$(id -u)" >> .env
echo "AIRFLOW_JWT_SECRET=$(openssl rand -hex 32)" >> .env
echo "AIRFLOW_ADMIN_PASSWORD=change-me-locally" >> .env
```

Airflow encrypts passwords stored in connections with a Fernet key. Generate one with the Airflow image itself, so you need nothing installed on your laptop:

```bash
docker run --rm apache/airflow:3.3.2-python3.11 \
  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Add the printed value to `.env` as `AIRFLOW_FERNET_KEY=...`. Add the four names (with placeholder values, never the real ones) to `.env.example` so the next person knows they exist. `logs/` is already in `.gitignore` from Module 2.

**Step 3: the image.** Save this as `airflow/Dockerfile`:

```dockerfile
FROM apache/airflow:3.3.2-python3.11

# Packages your pipelines/ code imports, installed next to Airflow.
# Pinning apache-airflow stops pip from upgrading or downgrading Airflow itself.
COPY requirements.txt /requirements.txt
RUN pip install --no-cache-dir "apache-airflow==${AIRFLOW_VERSION}" -r /requirements.txt

# dbt gets its own virtual environment so its dependencies never fight Airflow's.
RUN python -m venv /home/airflow/dbt-venv \
 && /home/airflow/dbt-venv/bin/pip install --no-cache-dir "dbt-postgres==1.11.0"
```

And `airflow/requirements.txt`, listing the libraries your `pipelines/` package imports (check your root `requirements.txt` and copy the runtime ones, not pytest or ruff):

```text
psycopg[binary]>=3.2
requests>=2.32
python-dotenv>=1.0
pydantic>=2.8
pandas>=2.2
pyarrow>=17
s3fs>=2024.6
tenacity>=9.0
```

`tenacity` is only needed if you switched `http_utils.py` to it in Module 6; keeping it does no harm. The dbt pin above satisfies Module 6's `dbt-core>=1.10` and `dbt-postgres>=1.11,<1.12`; if your laptop runs a different dbt version, use that same version here. Two separate environments for Airflow and dbt is the pattern Astronomer and the dbt community recommend, and it saves you from the most common Airflow install failure: a dependency conflict.

**Step 4: the services.** Add this to `compose.yaml`. The `x-airflow-common` block at the top level (next to `services:`) holds the settings every Airflow service shares; each service then pulls it in with `<<: *airflow-common`:

```yaml
x-airflow-common: &airflow-common
  build: ./airflow
  image: shoplink-airflow:3.3.2
  env_file: [.env]
  environment: &airflow-common-env
    AIRFLOW__CORE__EXECUTOR: LocalExecutor
    AIRFLOW__CORE__AUTH_MANAGER: airflow.providers.fab.auth_manager.fab_auth_manager.FabAuthManager
    AIRFLOW__DATABASE__SQL_ALCHEMY_CONN: postgresql+psycopg2://shoplink:${POSTGRES_PASSWORD}@postgres:5432/airflow
    AIRFLOW__CORE__FERNET_KEY: ${AIRFLOW_FERNET_KEY}
    AIRFLOW__CORE__DAGS_ARE_PAUSED_AT_CREATION: "true"
    AIRFLOW__CORE__LOAD_EXAMPLES: "false"
    AIRFLOW__CORE__EXECUTION_API_SERVER_URL: http://airflow-apiserver:8080/execution/
    AIRFLOW__API_AUTH__JWT_SECRET: ${AIRFLOW_JWT_SECRET}
    AIRFLOW__SCHEDULER__ENABLE_HEALTH_CHECK: "true"
    AIRFLOW_CONFIG: /opt/airflow/config/airflow.cfg
    # Makes "import pipelines" work inside tasks
    PYTHONPATH: /opt/airflow
    # How the pipeline reaches the other services from inside the network.
    SHOPLINK_APP_DB_URL: postgresql://shoplink:${POSTGRES_PASSWORD}@postgres:5432/shoplink_app
    SHOPLINK_WAREHOUSE_DB_URL: postgresql://shoplink:${POSTGRES_PASSWORD}@postgres:5432/warehouse
    SHOPLINK_API_URL: http://mock-api:8000
    S3_ENDPOINT_URL: http://rustfs:9000
    AWS_ACCESS_KEY_ID: ${S3_ACCESS_KEY:-shoplink}
    AWS_SECRET_ACCESS_KEY: ${S3_SECRET_KEY:-shoplink123}
    DBT_HOST: postgres
  volumes:
    - ./dags:/opt/airflow/dags
    - ./logs:/opt/airflow/logs
    - ./airflow/config:/opt/airflow/config
    - ./airflow/plugins:/opt/airflow/plugins
    - ./pipelines:/opt/airflow/pipelines
    - ./shoplink_dbt:/opt/airflow/shoplink_dbt
    - ./data:/opt/airflow/data
    - ./sql:/opt/airflow/sql
  user: "${AIRFLOW_UID:-50000}:0"
  depends_on: &airflow-common-depends-on
    postgres:
      condition: service_healthy

services:
  # ... your existing postgres, rustfs and rustfs-init services stay here, plus mock-api below ...

  airflow-init:
    <<: *airflow-common
    entrypoint: /bin/bash
    command:
      - -c
      - |
        mkdir -p /opt/airflow/logs /opt/airflow/dags /opt/airflow/plugins /opt/airflow/config
        /entrypoint airflow version
        chown -R "${AIRFLOW_UID:-50000}:0" /opt/airflow/logs /opt/airflow/config /opt/airflow/plugins
    environment:
      <<: *airflow-common-env
      _AIRFLOW_DB_MIGRATE: "true"
      _AIRFLOW_WWW_USER_CREATE: "true"
      _AIRFLOW_WWW_USER_USERNAME: airflow
      _AIRFLOW_WWW_USER_PASSWORD: ${AIRFLOW_ADMIN_PASSWORD}
    user: "0:0"

  airflow-apiserver:
    <<: *airflow-common
    command: api-server
    ports:
      - "8080:8080"
    healthcheck:
      test: ["CMD", "curl", "--fail", "http://localhost:8080/api/v2/monitor/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
    restart: always
    depends_on:
      <<: *airflow-common-depends-on
      airflow-init:
        condition: service_completed_successfully

  airflow-scheduler:
    <<: *airflow-common
    command: scheduler
    healthcheck:
      test: ["CMD-SHELL", 'airflow jobs check --job-type SchedulerJob --hostname "$${HOSTNAME}"']
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
    restart: always
    depends_on:
      <<: *airflow-common-depends-on
      airflow-init:
        condition: service_completed_successfully

  airflow-dag-processor:
    <<: *airflow-common
    command: dag-processor
    healthcheck:
      test: ["CMD-SHELL", 'airflow jobs check --job-type DagProcessorJob --hostname "$${HOSTNAME}"']
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
    restart: always
    depends_on:
      <<: *airflow-common-depends-on
      airflow-init:
        condition: service_completed_successfully

  airflow-triggerer:
    <<: *airflow-common
    command: triggerer
    healthcheck:
      test: ["CMD-SHELL", 'airflow jobs check --job-type TriggererJob --hostname "$${HOSTNAME}"']
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
    restart: always
    depends_on:
      <<: *airflow-common-depends-on
      airflow-init:
        condition: service_completed_successfully
```

A few details are easy to get wrong:

- **`depends_on` with `service_healthy`** relies on the `pg_isready` healthcheck you gave `postgres` in Module 2.
- **`$${HOSTNAME}`** has two dollar signs so Compose passes a literal `$HOSTNAME` to the shell inside the container instead of trying to fill it in itself.
- **Inside the network, services use names, not `localhost`.** The pipeline running in Airflow reaches PostgreSQL at `postgres:5432`, RustFS at `rustfs:9000` and the API at `http://mock-api:8000` (the `SHOPLINK_API_URL` in the common environment block). Module 6 ran the mock API as a plain `uvicorn` process, which containers cannot reach; stop it (Ctrl+C) and add it as a service under `services:`:

  ```yaml
    mock-api:
      image: python:3.12-slim
      working_dir: /app
      command: ["sh", "-c", "pip install --no-cache-dir 'fastapi[standard]>=0.115' && uvicorn pipelines.mock_api:app --host 0.0.0.0 --port 8000"]
      environment:
        SHOPLINK_DATA_DIR: /app/data
        SHOPLINK_BATCHES: ${SHOPLINK_BATCHES:-shoplink,shoplink-batch-2}
      ports: ["8000:8000"]
      volumes:
        - ./pipelines:/app/pipelines:ro
        - ./data:/app/data:ro
  ```

  To serve batch 1 only: `SHOPLINK_BATCHES=shoplink docker compose up -d mock-api`.
- **`airflow-triggerer`** is not strictly needed to start Airflow, but lesson 4 uses deferrable sensors, which run in it.

**Step 5: start it.**

```bash
docker compose build airflow-init
docker compose up airflow-init
docker compose up -d rustfs mock-api
docker compose up -d airflow-apiserver airflow-scheduler airflow-dag-processor airflow-triggerer
docker compose ps
```

`airflow-init` should finish with exit code 0 after printing the Airflow version. It creates the tables in the `airflow` database and your `airflow` admin user. When the other four show `healthy`, open http://localhost:8080 and log in as `airflow` with the password you put in `.env`.

Useful commands from now on:

```bash
docker compose exec airflow-scheduler airflow dags list
docker compose exec airflow-scheduler airflow dags list-import-errors
docker compose logs -f airflow-scheduler
docker compose stop airflow-apiserver airflow-scheduler airflow-dag-processor airflow-triggerer
```

The last one frees about 4 GB when you are working on something else.

## Resources

- docs: [Running Airflow in Docker](https://airflow.apache.org/docs/apache-airflow/3.3.2/howto/docker-compose/index.html) · Apache Airflow · The official Compose setup this lesson adapts, including the AIRFLOW_UID and memory notes.
- docs: [Architecture overview](https://airflow.apache.org/docs/apache-airflow/3.3.2/core-concepts/overview.html) · Apache Airflow · The scheduler, DAG processor, API server, triggerer and metadata database, with diagrams.
- docs: [Customizing the image](https://airflow.apache.org/docs/docker-stack/build.html) · Apache Airflow · How to extend `apache/airflow` with your own packages, and why you pin the Airflow version while doing it.
- read: [Hands-on Apache Airflow 3.0 tutorial](https://www.startdataengineering.com/post/airflow-tutorial/) · Start Data Engineering · A practical, production-minded walk through Airflow 3 concepts.
- watch: [Data Engineering Course for Beginners](https://www.youtube.com/watch?v=PHsC_t0j1dU) · freeCodeCamp.org · 11.9M subscribers · 1.1M views · 17K likes · published 2024-01-16 · checked 2026-09-28 · 184 min

## Practice

1. Add Airflow to your `compose.yaml` as above and get all four long-running services healthy.
2. In the UI, find: the Airflow version, the list of DAGs (empty for now), and the Admin menu pages for Connections, Variables and Pools.
3. Answer in your own words: which Airflow component would you look at first if (a) a DAG file you saved does not appear in the UI, (b) a DAG appears but its runs never start, (c) the UI will not load?
4. Run `docker stats --no-stream` and note how much memory the Airflow containers use together.

## Example answer

For step 3:

- **(a) The DAG does not appear:** the DAG processor. Run `docker compose exec airflow-scheduler airflow dags list-import-errors`. The usual cause is a Python error in the file, or an import that is not installed in the image. The DAG processor re-reads the folder every few minutes, so also allow a short wait.
- **(b) Runs never start:** the scheduler. Check the DAG is unpaused (new DAGs start paused because of `DAGS_ARE_PAUSED_AT_CREATION`), then `docker compose logs airflow-scheduler`. If the scheduler container is unhealthy, nothing gets scheduled.
- **(c) The UI will not load:** the API server. `docker compose ps` shows whether it is healthy, and `docker compose logs airflow-apiserver` shows why not. A common cause on a first start is that `airflow-init` failed, so the API server never started.

For step 4, expect roughly 2.5 to 4 GB across the four Airflow containers when idle, with the scheduler and API server the largest. Your numbers will differ with your machine; what matters is knowing where the memory goes, so you can stop services you are not using.

A common setup failure worth knowing: if `airflow-init` fails with "password authentication failed", the password in `AIRFLOW__DATABASE__SQL_ALCHEMY_CONN` does not match your `postgres` service. Both read `POSTGRES_PASSWORD` from `.env`, so check that the variable is set there.

# Lesson: DAGs and the TaskFlow API

minutes: 55

## A DAG is a Python file

Airflow finds workflows by reading Python files in `dags/`. Each file defines one or more DAGs. The modern way to write them is the **TaskFlow API**: you decorate a function with `@dag` to make a DAG, and decorate inner functions with `@task` to make tasks. Save this as `dags/shoplink_hello.py`:

```python
"""A first DAG: three tasks, one dependency chain."""
import pendulum
from airflow.sdk import dag, task


@dag(
    dag_id="shoplink_hello",
    schedule=None,  # only runs when you trigger it
    start_date=pendulum.datetime(2026, 9, 1, tz="UTC"),
    catchup=False,
    tags=["shoplink", "learning"],
)
def shoplink_hello():
    @task
    def count_warehouses() -> int:
        return 5

    @task
    def count_products() -> int:
        return 120

    @task
    def summarise(warehouses: int, products: int) -> None:
        print(f"ShopLink has {warehouses} warehouses and {products} products")

    summarise(count_warehouses(), count_products())


shoplink_hello()
```

Three things happen in the last lines of the function:

- Calling a `@task` function inside a DAG does not run it. It creates a task and returns a reference to its future result.
- Passing that reference into another task (`summarise(...)`) creates a **dependency** and passes the value between them. Airflow runs both counts first (in parallel, because neither depends on the other), then `summarise`.
- The final `shoplink_hello()` call at the bottom registers the DAG. Forget it and the DAG never appears.

Within a minute or two it shows up in the UI. Unpause it with the toggle, click Trigger, then open the run's Graph view and click `summarise` to read its log.

## Dependencies without data

Often one task must wait for another but does not need its result. Use `>>` ("then"):

```python
extract = extract_orders()
load = load_orders()
extract >> load
```

For fan-out and fan-in, use lists: `[extract_app_db, extract_supplier, extract_api] >> validate` means `validate` waits for all three. `chain(a, b, c)` from `airflow.sdk` is the same as `a >> b >> c`, and is handy for long sequences.

## Operators and tasks

Before TaskFlow, every task was an **operator** object. Operators still matter: they are ready-made tasks for common jobs, and you mix them freely with `@task` functions.

| Use | When |
|---|---|
| `@task` (a Python function) | Your own logic, such as calling your `pipelines` package |
| `BashOperator` | Running a command-line tool, such as dbt |
| `SQLExecuteQueryOperator` | Running SQL against a connection |
| Provider operators | Talking to a specific system: S3, Spark, Snowflake, Slack and hundreds more, each in a provider package |
| Sensors | Waiting for something to be true (lesson 4) |

Most core operators live in the **standard provider** in Airflow 3:

```python
from airflow.providers.standard.operators.bash import BashOperator

check_dbt = BashOperator(
    task_id="dbt_version",
    bash_command="/home/airflow/dbt-venv/bin/dbt --version",
)
```

## Rules that keep DAG files healthy

The DAG processor imports every file in `dags/` over and over, every few minutes. So:

1. **No work at the top level.** Never connect to a database, call an API or read a big file outside a task. That code would run on every parse, not once per run.
2. **Heavy imports inside tasks.** `import pandas` inside the task function, not at the top of the file, keeps parsing fast.
3. **Tasks should be idempotent.** A task may run twice (a retry, a manual rerun). Your Module 6 loads already replace a load date's data rather than appending, so rerunning them is safe. Keep it that way.
4. **Tasks should be small enough to retry.** If one task extracts, validates and loads, a failed load forces a new extract. One step per task gives you cheaper retries and clearer logs.
5. **Airflow orchestrates; it does not process.** A task that pulls 10 million rows into the scheduler's memory is a bad task. Push heavy work to the database, to Spark (Module 8) or to dbt, and let the task start it and check the result.

## Calling your pipeline from tasks

Airflow tasks should call the same code you run by hand, and Module 6 already wrote it: the five functions in `pipelines/steps.py`. Each takes the load date as a `YYYY-MM-DD` string, is safe to run twice for the same date, raises an exception when something is wrong, and returns only small values. For 2026-07-31 they return:

| Function | Returns |
|---|---|
| `extract_app_db_tables(load_date)` | Rows per table: `{"customers": 430, "warehouses": 5, "orders": 9521, "order_lines": 27995}` |
| `extract_supplier_file(load_date, path)` | The file's row count: `120` |
| `extract_orders_api(load_date)` | Rows fetched from the API: `574` |
| `validate_bronze(load_date, threshold)` | Per dataset, `{"rows": ..., "quarantined": ..., "ratio": ...}`; writes `raw.quarantine` and raises above the threshold |
| `load_raw(load_date)` | Rows per raw table: `{"raw.app_customers": 430, ..., "raw.app_order_lines": 27993, "raw.supplier_products": 120, "raw.orders_api": 574}` |

You do not change `steps.py`. Each Airflow task is a thin wrapper that passes `ds` in, with the import inside the task so the DAG file stays fast to parse:

```python
@task
def extract_app_db(ds=None) -> dict:
    from pipelines import steps
    return steps.extract_app_db_tables(ds)


@task
def extract_supplier_file(ds=None) -> int:
    from pipelines import steps
    # An absolute path: the task's working directory is not your repo root.
    return steps.extract_supplier_file(ds, f"/opt/airflow/data/incoming/supplier/{ds}/products.csv")


@task
def extract_orders_api(ds=None) -> int:
    from pipelines import steps
    return steps.extract_orders_api(ds)


@task(pool="shoplink_postgres")
def load_raw(ds=None) -> dict:
    from pipelines import steps
    return steps.load_raw(ds)


@task(pool="shoplink_postgres")
def build_marts() -> None:
    """Rebuild Module 5's star schema from raw, so the marts refresh every day."""
    from pathlib import Path

    from pipelines.db import connect

    sql = Path("/opt/airflow/sql/transforms/marts.sql").read_text(encoding="utf-8")
    with connect() as conn:
        conn.autocommit = True      # marts.sql has its own BEGIN and COMMIT
        conn.execute(sql)
```

The `validate` task, which reads its threshold from an Airflow variable, comes in lesson 4. `build_marts` runs Module 5's `marts.sql` (mounted at `/opt/airflow/sql`) after `load_raw` and before dbt, so `marts.*` is rebuilt from the new raw data on every run. Declaring `ds=None` is how a TaskFlow task receives the run's logical date; lesson 3 explains it. The `shoplink_postgres` pool is created in lesson 4; until it exists, leave `pool=` out.

## Resources

- docs: [Pythonic Dags with the TaskFlow API](https://airflow.apache.org/docs/apache-airflow/3.3.2/tutorial/taskflow.html) · Apache Airflow · The official TaskFlow tutorial, including how values pass between tasks.
- docs: [Dags](https://airflow.apache.org/docs/apache-airflow/3.3.2/core-concepts/dags.html) · Apache Airflow · Declaring DAGs, dependencies, `chain`, and what the DAG processor does with your files.
- docs: [Best practices](https://airflow.apache.org/docs/apache-airflow/3.3.2/best-practices.html) · Apache Airflow · Top-level code, idempotent tasks and testing, straight from the project.
- watch: [Write your first DAG in Airflow 3 for beginners](https://www.youtube.com/watch?v=dX6p-EwnkP4) · Data with Marc · 41.2K subscribers · 21.6K views · 616 likes · published 2025-06-20 · checked 2026-09-28 · 20 min
- watch: [Airflow Tutorial for Beginners - Full Course in 2 Hours 2022](https://www.youtube.com/watch?v=K9AnJ9_ZAXE) · coder2j · 18.7K subscribers · 1.0M views · 15K likes · published 2022-06-05 · checked 2026-09-28 · 121 min · Airflow 2, so the imports differ, but the concepts are the same.

## Practice

1. Run `shoplink_hello` and find, in the logs, the line printed by `summarise`.
2. Write `dags/shoplink_pipeline_skeleton.py`, with `schedule=None`, containing these tasks as `@task` functions that only print their name and return a number: `extract_app_db`, `extract_supplier_file`, `extract_orders_api`, `validate`, `load_raw`, `build_marts`, `quality_checks`, plus a `BashOperator` called `dbt_build` that runs `dbt --version`. Wire them so the three extracts run in parallel, `validate` waits for all three, and the rest run in the order listed with `dbt_build` between `build_marts` and `quality_checks`.
3. Break the file on purpose (delete a closing bracket), and find the error with `airflow dags list-import-errors`. Fix it.
4. Explain in two sentences why `rows = requests.get(API).json()` at the top of a DAG file is a bug even though the DAG still works.

## Example answer

A skeleton that meets step 2:

```python
import pendulum
from airflow.providers.standard.operators.bash import BashOperator
from airflow.sdk import dag, task


@dag(
    dag_id="shoplink_pipeline_skeleton",
    schedule=None,
    start_date=pendulum.datetime(2026, 9, 1, tz="UTC"),
    catchup=False,
    tags=["shoplink", "learning"],
)
def shoplink_pipeline_skeleton():
    @task
    def extract_app_db() -> int:
        print("extract_app_db")
        return 1

    @task
    def extract_supplier_file() -> int:
        print("extract_supplier_file")
        return 1

    @task
    def extract_orders_api() -> int:
        print("extract_orders_api")
        return 1

    @task
    def validate(app_db: int, supplier: int, api: int) -> int:
        print("validate", app_db + supplier + api)
        return 1

    @task
    def load_raw() -> int:
        print("load_raw")
        return 1

    @task
    def build_marts() -> int:
        print("build_marts")
        return 1

    @task
    def quality_checks() -> None:
        print("quality_checks")

    dbt_build = BashOperator(
        task_id="dbt_build",
        bash_command="/home/airflow/dbt-venv/bin/dbt --version",
    )

    validated = validate(extract_app_db(), extract_supplier_file(), extract_orders_api())
    validated >> load_raw() >> build_marts() >> dbt_build >> quality_checks()


shoplink_pipeline_skeleton()
```

Passing the three results into `validate` creates the fan-in. Writing `[a, b, c] >> validate()` with no arguments is equally correct. The Graph view should show three boxes on the left joining into `validate`, then a straight line.

For step 3, `list-import-errors` prints the file path and a `SyntaxError` with the line number. The DAG disappears from the list (or keeps its last good version, with an error banner in the UI) until the file parses again.

For step 4: the DAG processor imports the file every few minutes, so the request runs hundreds of times a day, hammering the API and slowing parsing even when no run is due. Worse, if the API is down, the file fails to import and the whole DAG disappears from Airflow. Work belongs inside tasks.

# Lesson: Scheduling, catchup and backfills

minutes: 55

## Schedules

The `schedule` argument decides when runs are created:

| Value | Meaning |
|---|---|
| `None` | Only when triggered by hand or by the API |
| `"@daily"` | Every day at midnight (in the DAG's timezone) |
| `"0 2 * * *"` | A cron expression: 02:00 every day |
| `timedelta(hours=6)` | Every six hours |
| A timetable object | Full control, such as `CronDataIntervalTimetable("0 2 * * *", timezone="UTC")` |

Airflow stores all dates in UTC. The `start_date` you give (with `pendulum` and a timezone) decides which timezone the cron expression is read in. This course keeps DAGs in UTC: `@daily` then runs at 01:00 in Lagos, and the date your tasks receive is the same date you see in the UI.

## The logical date, and what changed in Airflow 3

Every Dag run has a **logical date**, available to tasks and templates as `logical_date` and, formatted as `YYYY-MM-DD`, as `ds`. Your tasks pass `ds` to the pipeline as the load date. That single idea is what makes reruns and backfills work: the run for 2026-09-20 always loads 2026-09-20, whenever it actually runs.

Airflow also has a **data interval**, the period of data a run covers (`data_interval_start` to `data_interval_end`). How the two relate depends on the kind of timetable, and this is the part older tutorials get wrong for Airflow 3:

| Timetable kind | Used for | Logical date of the run that starts at 00:00 on 28 September | Data interval |
|---|---|---|---|
| Trigger (`CronTriggerTimetable`) | Cron strings and presets such as `@daily` **by default in Airflow 3** | 28 September | Zero length: start and end are both the trigger time |
| Data interval (`CronDataIntervalTimetable`) | The Airflow 2 default; choose it explicitly in Airflow 3 | 27 September | 27 September 00:00 to 28 September 00:00 |

The setting behind this is `[scheduler] create_cron_data_intervals`, which defaults to `False` in Airflow 3 and `True` in Airflow 2. Neither is wrong, but you must know which one you have:

- With the Airflow 3 default, `ds` is "the day the run happened". The ShopLink ingest uses it as the load date: "what did the sources look like when we loaded on 28 September".
- If a task needs "yesterday's full day of events", use a data-interval timetable and filter on `data_interval_start` and `data_interval_end`, which gives an exact, non-overlapping window per run:

```python
import pendulum
from airflow.sdk import CronDataIntervalTimetable, dag


@dag(
    schedule=CronDataIntervalTimetable("0 0 * * *", timezone="UTC"),
    start_date=pendulum.datetime(2026, 9, 1, tz="UTC"),
    catchup=False,
)
def shoplink_events_daily():
    ...
```

A task reading the window then queries `where updated_at >= %(start)s and updated_at < %(end)s`, with the two values taken from `data_interval_start` and `data_interval_end`. Half-open windows (`>=` start, `<` end) never count a row twice.

## Catchup

`start_date` is the earliest date the DAG may have runs for. When you unpause a DAG whose `start_date` is in the past, `catchup` decides what happens:

- `catchup=True`: Airflow creates a run for every missed schedule since `start_date`, all at once. A DAG with a start date a year ago creates 365 runs the moment you switch it on.
- `catchup=False`: Airflow only schedules from now on.

This course uses `catchup=False` for every DAG. Past dates are loaded on purpose, with a backfill, not by accident when someone clicks a toggle.

## Backfills in Airflow 3

A **backfill** creates runs for a range of past logical dates. In Airflow 3, backfills are run by the scheduler like normal runs (they show up in the UI, with their own retries and logs), and you create them from the CLI or from the Trigger button in the UI:

```bash
docker compose exec airflow-scheduler airflow backfill create \
  --dag-id shoplink_daily_ingest \
  --from-date 2026-09-01 --to-date 2026-09-07 \
  --max-active-runs 1 \
  --dry-run
```

`--dry-run` lists the logical dates it would create without creating anything; remove it to run for real. The options worth knowing:

| Option | What it does |
|---|---|
| `--from-date`, `--to-date` | The range, both ends inclusive |
| `--reprocess-behavior` | What to do when a run already exists for a date: `none` (the default, skip it), `failed` (rerun only failed ones), `completed` (rerun everything) |
| `--max-active-runs` | How many of the backfill's runs may run at the same time |
| `--run-backwards` | Newest date first |

Two ShopLink-specific cautions. First, the orders API extractor works out its watermark from what earlier load dates already loaded, so its runs must happen **in date order, one at a time**. That is why the example uses `--max-active-runs 1` and not `--run-backwards`, and why the DAG itself sets `max_active_runs=1`. Second, backfills are only safe because each task is idempotent for its load date. A backfill over a non-idempotent pipeline duplicates data for every date in the range.

## Triggering one run by hand

Manually triggered runs in Airflow 3 do not have to have a logical date. The ShopLink tasks need one, so always give it:

```bash
docker compose exec airflow-scheduler airflow dags trigger shoplink_daily_ingest -l 2026-09-27
```

In the UI's Trigger form, set the logical date field. For a quick test that bypasses the scheduler entirely, `airflow dags test shoplink_daily_ingest 2026-09-27` runs the whole DAG in one process and prints every log to your terminal.

## Resources

- docs: [Timetables](https://airflow.apache.org/docs/apache-airflow/3.3.2/authoring-and-scheduling/timetable.html) · Apache Airflow · Trigger versus data interval timetables, and the `create_cron_data_intervals` setting.
- docs: [Backfill](https://airflow.apache.org/docs/apache-airflow/3.3.2/core-concepts/backfill.html) · Apache Airflow · Reprocess behaviour, concurrency, ordering and dry runs.
- docs: [Dag runs](https://airflow.apache.org/docs/apache-airflow/3.3.2/core-concepts/dag-run.html) · Apache Airflow · Logical dates, data intervals and catchup.
- docs: [Templates reference](https://airflow.apache.org/docs/apache-airflow/3.3.2/templates-ref.html) · Apache Airflow · Every template variable, including `ds`, `logical_date` and `data_interval_start`.

## Practice

1. Change `shoplink_hello` to `schedule="@daily"` with `start_date` seven days ago and `catchup=True`. Unpause it and count the runs created. Then set `catchup=False`, delete the DAG's runs in the UI, and unpause it again. What changed?
2. Add a task that prints `ds`, `logical_date`, `data_interval_start` and `data_interval_end`. Trigger it for 2026-09-27 and write down the values. Then switch the schedule to `CronDataIntervalTimetable("0 0 * * *", timezone="UTC")` and compare the values for a scheduled run.
3. Run `airflow backfill create` with `--dry-run` for 2026-09-01 to 2026-09-07 on `shoplink_hello`, and read the output.
4. A colleague sets `max_active_runs=10` on the ShopLink ingest to make a 30-day backfill faster. Explain what could go wrong.

## Example answer

1. With `catchup=True` and a start date seven days ago, Airflow creates a run for each missed day at once (seven or eight, depending on the time of day). With `catchup=False`, it creates no past runs and waits for the next midnight UTC. That difference is why a wrong `catchup` on a DAG with an old start date can flood a warehouse.

2. A task that prints them:

```python
@task
def show_dates(ds=None, logical_date=None, data_interval_start=None, data_interval_end=None):
    print(f"ds={ds} logical_date={logical_date}")
    print(f"interval={data_interval_start} to {data_interval_end}")
```

Declaring parameters with the names of context variables is how TaskFlow hands them to you. With the default `@daily` (a trigger timetable), a run for 2026-09-27 prints `ds=2026-09-27` and a data interval that starts and ends at 2026-09-27 00:00 UTC. With `CronDataIntervalTimetable`, the scheduled run that starts at 00:00 on 28 September prints `ds=2026-09-27` and an interval from 27 September 00:00 to 28 September 00:00. Same wall-clock start, a different date: this is the Airflow 2 versus Airflow 3 difference in one experiment.

3. The dry run lists seven logical dates, 2026-09-01 to 2026-09-07, and creates nothing.

4. With ten runs at once, several dates would extract from the orders API at the same time, each working out its watermark from earlier load dates that have not finished loading yet. Two runs could use the same watermark and land overlapping rows, or a run could start before the one it depends on has loaded, and miss rows. The loads also compete for the same tables and the same small PostgreSQL server. For this pipeline, dates must run in order; the way to go faster is to make each run faster, not to run more of them.

# Lesson: Connections, variables, XCom and sensors

minutes: 55

## Connections: credentials in one place

A **connection** stores how to reach a system: type, host, port, login, password, database and extras. Tasks refer to it by id, so passwords never appear in DAG code, and changing a password means changing one connection, not ten files.

You can create connections in the UI (Admin, then Connections), with the CLI, or with environment variables named `AIRFLOW_CONN_<ID>`. Environment variables suit this project, because the values come from `.env`, which is already git-ignored. Add these to the `environment` block of `x-airflow-common`:

```yaml
    AIRFLOW_CONN_SHOPLINK_WAREHOUSE: postgresql://shoplink:${POSTGRES_PASSWORD}@postgres:5432/warehouse
    AIRFLOW_CONN_FS_DEFAULT: '{"conn_type": "fs", "extra": {"path": "/opt/airflow/data"}}'
```

The first uses the URI form; the second uses the JSON form. The connection ids are `shoplink_warehouse` and `fs_default` (lowercase, from the part after `AIRFLOW_CONN_`). Connections defined in environment variables do not appear in the UI list, but tasks can use them. Check one with:

```bash
docker compose exec airflow-scheduler airflow connections get shoplink_warehouse
```

A task uses a connection through a **hook**, the provider's client for that system:

```python
@task
def count_raw_orders(ds=None) -> int:
    from airflow.providers.postgres.hooks.postgres import PostgresHook

    hook = PostgresHook(postgres_conn_id="shoplink_warehouse")
    return hook.get_first(
        "select count(*) from raw.orders_api where _load_date = %(ds)s", parameters={"ds": ds}
    )[0]
```

The Postgres provider is already in the `apache/airflow` image. Always pass values as `parameters`, never by formatting them into the SQL string.

## Variables: small settings

A **variable** is a key and a value for settings that change without a code change, such as a threshold or an email address. Read them inside tasks, never at the top of a DAG file (each read is a call to the API server, and top-level code runs on every parse):

```python
from airflow.sdk import Variable


@task(pool="shoplink_postgres")
def validate(ds=None) -> dict:
    from pipelines import steps

    threshold = float(Variable.get("shoplink_quarantine_threshold", default="0.02"))
    # Writes raw.quarantine for ds, and raises if any dataset is above the threshold.
    summary = steps.validate_bronze(ds, threshold=threshold)
    return {dataset: s["quarantined"] for dataset, s in summary.items()}
```

The threshold check itself stays in Module 6's `validate_bronze`; the task only decides where the number comes from. It returns just the quarantined count per dataset, which is all a downstream task or a person reading XCom needs.

Set it with `airflow variables set shoplink_quarantine_threshold 0.02`, in the UI, or with an environment variable `AIRFLOW_VAR_SHOPLINK_QUARANTINE_THRESHOLD`. Variables are not for secrets (use connections or a secrets backend) and not for data.

## XCom: small values between tasks

When a `@task` returns a value and another task receives it, Airflow passes it through **XCom** ("cross-communication"), stored in the metadata database. That makes XCom right for small things: a row count, a file path, a date, a short dictionary of counts. It is wrong for data. A DataFrame of 26,000 order lines returned from a task would be serialised into the metadata database on every run, slowing down everything that uses it.

The rule: **pass references, not data**. The extract task writes to RustFS and returns the object key or a count; the next task reads from RustFS itself.

## Sensors: waiting for something

A **sensor** is a task that waits until a condition is true. ShopLink's supplier drops `products.csv` into a landing folder some time each morning; the load must not start before it arrives. In this course the landing folder is `data/incoming/supplier/<load date>/products.csv`, which is `/opt/airflow/data/incoming/supplier/...` inside the containers:

```python
from airflow.providers.standard.sensors.filesystem import FileSensor

wait_for_supplier_file = FileSensor(
    task_id="wait_for_supplier_file",
    fs_conn_id="fs_default",                      # its "path" extra is /opt/airflow/data
    filepath="incoming/supplier/{{ ds }}/products.csv",
    poke_interval=300,                            # check every 5 minutes
    timeout=6 * 60 * 60,                          # give up after 6 hours
    deferrable=True,
)
```

How a sensor waits matters more than it looks:

| Mode | How it waits | Cost |
|---|---|---|
| `poke` (the default) | Holds a worker slot and sleeps between checks | A slot is blocked for the whole wait. Ten waiting sensors can starve every other task |
| `reschedule` | Gives up its slot between checks, and is rescheduled for the next check | Cheaper, but each check is a new task start |
| `deferrable=True` | Hands the wait to the **triggerer** service, which watches many conditions in one lightweight process | The cheapest; the task holds no slot until the file appears |

Prefer deferrable sensors wherever the sensor supports it. Always set a `timeout`: a sensor waiting forever for a file that will never come is a silent failure.

To simulate the supplier dropping today's file:

```bash
mkdir -p data/incoming/supplier/2026-09-27
cp data/shoplink/products.csv data/incoming/supplier/2026-09-27/
```

## Pools: protecting shared systems

Your laptop's PostgreSQL server is shared by the app database, the warehouse and Airflow itself. If a backfill starts many load tasks at once, they compete for it. A **pool** limits how many tasks using a resource can run at the same time, across all DAGs:

```bash
docker compose exec airflow-scheduler airflow pools set shoplink_postgres 2 "Tasks that write to the ShopLink PostgreSQL server"
```

Then give heavy tasks `pool="shoplink_postgres"`, for example `@task(pool="shoplink_postgres")`. Tasks beyond the limit wait in the `scheduled` state until a slot frees up. Every Airflow installation also has a `default_pool` with 128 slots, which is what tasks use when you name none.

## Resources

- docs: [Managing connections](https://airflow.apache.org/docs/apache-airflow/3.3.2/howto/connection.html) · Apache Airflow · URI and JSON formats, and environment variable connections.
- docs: [XComs](https://airflow.apache.org/docs/apache-airflow/3.3.2/core-concepts/xcoms.html) · Apache Airflow · What XCom is for, size limits, and custom backends.
- docs: [Deferrable operators and triggers](https://airflow.apache.org/docs/apache-airflow/3.3.2/authoring-and-scheduling/deferring.html) · Apache Airflow · How the triggerer runs waits without holding worker slots.
- docs: [Pools](https://airflow.apache.org/docs/apache-airflow/3.3.2/administration-and-deployment/pools.html) · Apache Airflow · Limiting concurrency on shared resources.
- docs: [Variables](https://airflow.apache.org/docs/apache-airflow/3.3.2/core-concepts/variables.html) · Apache Airflow · Setting and reading variables, and why not to read them at the top level.

## Practice

1. Add the two connections to `compose.yaml`, restart the Airflow services (`docker compose up -d` recreates them), and check both with `airflow connections get`.
2. Write a DAG `shoplink_supplier_watch` (schedule `None`) with a deferrable `FileSensor` for `incoming/supplier/{{ ds }}/products.csv`, followed by a `@task` that counts the lines in the file and returns the count. Trigger it for 2026-09-28 before the file exists. Watch the sensor's state in the UI, then copy the file in and watch it finish.
3. Create the `shoplink_postgres` pool with 2 slots.
4. A teammate's task returns `pd.read_csv("data/shoplink/order_lines.csv")` so the next task can use it. Explain the problem and rewrite the design in one or two sentences.

## Example answer

For step 2:

```python
import pendulum
from airflow.providers.standard.sensors.filesystem import FileSensor
from airflow.sdk import dag, task


@dag(
    dag_id="shoplink_supplier_watch",
    schedule=None,
    start_date=pendulum.datetime(2026, 9, 1, tz="UTC"),
    catchup=False,
    tags=["shoplink", "learning"],
)
def shoplink_supplier_watch():
    wait = FileSensor(
        task_id="wait_for_supplier_file",
        fs_conn_id="fs_default",
        filepath="incoming/supplier/{{ ds }}/products.csv",
        poke_interval=60,
        timeout=60 * 60,
        deferrable=True,
    )

    @task
    def count_lines(ds=None) -> int:
        path = f"/opt/airflow/data/incoming/supplier/{ds}/products.csv"
        with open(path, encoding="utf-8") as f:
            rows = sum(1 for _ in f) - 1  # minus the header
        print(f"{rows} products in the supplier file for {ds}")
        return rows

    wait >> count_lines()


shoplink_supplier_watch()
```

While the file is missing, the sensor shows the state **deferred** (purple in the UI), not running: it is holding no slot, and the triggerer is watching for it. Within about a minute of copying the file in, it succeeds and `count_lines` returns 120. If it stays in `scheduled` or never defers, check that `airflow-triggerer` is healthy.

For step 4: returning the DataFrame pushes 26,779 rows through XCom into the metadata database on every run, which is slow, bloats the database, and can fail on size. Better: the first task writes the data where it belongs (a Parquet object in RustFS bronze, or a raw table) and returns only its key and row count; the next task reads the data from there.

# Lesson: Monitoring, alerting and running dbt from Airflow

minutes: 60

## Retries: absorb the temporary failures

Most pipeline failures at 02:00 are temporary: the API timed out, the database restarted. Retries turn those into non-events. Set them once for the whole DAG with `default_args`:

```python
from datetime import timedelta

default_args = {
    "retries": 3,
    "retry_delay": timedelta(minutes=2),
    "retry_exponential_backoff": True,   # 2, 4, 8 minutes between tries
    "max_retry_delay": timedelta(minutes=30),
    "execution_timeout": timedelta(minutes=30),
}
```

`execution_timeout` matters as much as retries: a task stuck on a hanging connection fails after 30 minutes instead of blocking the DAG forever. Retries are only safe because your tasks are idempotent. A retry of a non-idempotent load is a duplicate.

Your code should still fail fast on errors retrying cannot fix. A validation that finds 40% of rows bad should raise immediately; three retries would only give the same answer three times.

## Failure callbacks: tell someone

When a task has used up its retries, Airflow calls its `on_failure_callback` with the task's context. Put callbacks in `airflow/plugins/shoplink_alerts.py` (the plugins folder is importable from DAGs and from every Airflow service):

```python
"""Alert helpers shared by the ShopLink DAGs."""
import logging

log = logging.getLogger(__name__)


def _send(message: str) -> None:
    """Log the alert, and post it to a webhook if one is configured."""
    log.error(message)
    from airflow.sdk import Variable

    url = Variable.get("shoplink_alert_webhook", default="")
    if url:
        import requests

        requests.post(url, json={"text": message}, timeout=10)


def notify_task_failure(context) -> None:
    ti = context["task_instance"]
    _send(
        f"ShopLink ALERT: {ti.dag_id}.{ti.task_id} failed for {context.get('ds')} "
        f"after {ti.try_number} tries. See the task log in the Airflow UI (Grid view, run {context.get('run_id')})."
    )


def notify_deadline_missed(**kwargs) -> None:
    context = kwargs.get("context", {})
    dag_id = context.get("dag_run", {}).get("dag_id", "unknown")
    _send(f"ShopLink ALERT: {dag_id} missed its deadline and is still not finished")
```

A good alert answers three questions for the person reading it at 06:00: what failed (DAG and task), for which date, and where to look (the run id, or a link to the log). The webhook can be a Slack or Teams incoming webhook; without one, the alert is still in the task log. For email, Airflow also ships notifiers in provider packages (Slack, SMTP and others) that you can use in place of your own function.

## Deadline alerts: the Airflow 3 answer to "it is late"

A pipeline can fail by being slow as well as by erroring. Airflow 2 had task SLAs for this; **SLAs were removed in Airflow 3.0**. Their replacement, from Airflow 3.1, is the **deadline alert**: a DAG-level rule that says "if a run is not finished by this time, call this callback".

```python
from datetime import timedelta

from airflow.sdk import DeadlineAlert, DeadlineReference, SyncCallback
from shoplink_alerts import notify_deadline_missed

deadline = DeadlineAlert(
    reference=DeadlineReference.DAGRUN_QUEUED_AT,  # measured from when the run was queued
    interval=timedelta(hours=1),
    callback=SyncCallback(notify_deadline_missed),
)
```

Pass it to `@dag(..., deadline=deadline)`. Other references include `DAGRUN_LOGICAL_DATE`, `FIXED_DATETIME` and `AVERAGE_RUNTIME` (alert when a run takes much longer than recent runs). A `SyncCallback` runs through the executor like a high-priority task; an `AsyncCallback` runs in the triggerer. Deadline alerts are newer than the rest of this module, so check the documentation for your exact Airflow version before relying on the details.

## Logs and the UI

Every task try has its own log, in the UI (click the task, then Logs) and on disk under `logs/` in your repo, because that folder is mounted. The views you will use most:

| View | Use it to |
|---|---|
| Grid | See every run as a column and every task as a row; spot the red square |
| Graph | See the dependencies of one run, and which task blocked the rest |
| Task logs | Read exactly what a try printed, including the traceback |
| Task duration | Notice a task getting slower week by week, before it becomes a timeout |

Log what a future reader needs: the load date, row counts in and out, and the watermark used. "Loaded 574 rows into raw.orders_api for 2026-07-31, watermark 2026-06-30 22:00:00" answers most questions before anyone opens the database.

To recover a failed run, fix the cause, then **clear** the failed task in the UI (select it, then Clear, including downstream tasks). Airflow reruns it and everything after it, for the same logical date.

## Running dbt from Airflow

The simplest and most common way to run dbt from Airflow is a `BashOperator` that runs `dbt build` in the dbt project folder. Airflow sees the whole project as one task: if a model or test fails, the task fails and its log shows which one.

dbt inside the container reaches PostgreSQL at `postgres`, not `localhost`. Module 6's `shoplink_dbt/profiles.yml` already reads the host from `DBT_HOST`:

```yaml
shoplink:
  target: dev
  outputs:
    dev:
      type: postgres
      host: "{{ env_var('DBT_HOST', 'localhost') }}"
      port: 5432
      user: shoplink
      password: "{{ env_var('POSTGRES_PASSWORD') }}"
      dbname: warehouse
      schema: staging
      threads: 4
```

On your laptop `.env` sets `DBT_HOST=localhost`; in Airflow the `environment` block overrides it with `postgres` (it wins over `env_file`). Then the task:

```python
from airflow.providers.standard.operators.bash import BashOperator

dbt_build = BashOperator(
    task_id="dbt_build",
    bash_command=(
        "/home/airflow/dbt-venv/bin/dbt build"
        " --project-dir /opt/airflow/shoplink_dbt"
        " --profiles-dir /opt/airflow/shoplink_dbt"
        " --target dev"
        " --target-path /tmp/dbt/target --log-path /tmp/dbt/logs"
    ),
    pool="shoplink_postgres",
)
```

`--target-path` and `--log-path` send dbt's working files to the container's `/tmp`, so a run never leaves root-owned files in your repo.

**Astronomer Cosmos** is the popular alternative. It reads your dbt project and turns every model and test into its own Airflow task, so the Graph view shows your dbt lineage, and a failed model can be retried on its own. It costs more setup and more tasks per run. A reasonable path: start with `BashOperator`, move to Cosmos when the dbt project is big enough that "which model failed?" becomes a daily question. The AE track goes deep on dbt itself.

## Resources

- docs: [Callbacks](https://airflow.apache.org/docs/apache-airflow/3.3.2/administration-and-deployment/logging-monitoring/callbacks.html) · Apache Airflow · Every callback type and the context it receives.
- docs: [Deadline alerts](https://airflow.apache.org/docs/apache-airflow/3.3.2/howto/deadline-alerts.html) · Apache Airflow · References, callbacks, and migrating from SLAs.
- read: [Orchestrate dbt Core jobs with Airflow](https://www.astronomer.io/docs/learn/airflow-dbt) · Astronomer · The BashOperator and Cosmos approaches compared.
- docs: [Astronomer Cosmos](https://astronomer.github.io/astronomer-cosmos/) · Astronomer · Getting started with rendering dbt projects as Airflow task groups.

## Practice

1. Add `airflow/plugins/shoplink_alerts.py` and a DAG `shoplink_failure_drill` (schedule `None`) with one task that raises an exception, `retries=2`, `retry_delay=timedelta(seconds=30)` and `on_failure_callback=notify_task_failure`. Trigger it and find, in order: the two retries in the Grid view, and your alert line in the final try's log.
2. Add a deadline alert of two minutes to the same DAG with a task that sleeps for three minutes. Confirm the deadline callback fires.
3. Run `dbt build` once by hand inside Airflow's container: `docker compose exec airflow-scheduler /home/airflow/dbt-venv/bin/dbt build --project-dir /opt/airflow/shoplink_dbt --profiles-dir /opt/airflow/shoplink_dbt --target-path /tmp/dbt/target --log-path /tmp/dbt/logs`.
4. Write the alert message you would want to receive for a failed `load_raw` task, and say which three facts it must contain.

## Example answer

For step 1, the Grid view shows the task orange (up_for_retry) twice, then red. The third try's log ends with the traceback, followed by a line like:

```text
ShopLink ALERT: shoplink_failure_drill.always_fails failed for 2026-09-28 after 3 tries. See the task log in the Airflow UI (Grid view, run manual__2026-09-28T...).
```

The callback runs once, after the last try, not on every retry. (If you want to hear about retries too, there is `on_retry_callback`.)

For step 2, about two minutes after the run was queued the deadline callback runs, even though the task is still running, and its message appears in the logs of the callback. Deadline alerts do not stop the run; they tell you it is late.

For step 3, dbt prints its usual summary (`Completed successfully`, with your staging model and test passing). If it fails with "could not translate host name", `DBT_HOST` is missing from the container's environment; if with "password authentication failed", `POSTGRES_PASSWORD` is not reaching it through `env_file`.

For step 4, a strong alert: "ShopLink ALERT: shoplink_daily_ingest.load_raw failed for 2026-09-27 after 4 tries (last error: psycopg.OperationalError: connection refused). Log: <link>. Downstream dbt_build and quality_checks did not run, so today's marts still show yesterday's data." The three facts it must contain: what failed (DAG and task), which load date, and where to look. Saying what the business impact is (the marts are stale) is what makes it excellent.

# Quiz

passing_score: 70

### In Airflow 3, which component reads the Python files in the dags folder and stores the parsed DAGs?

- [ ] The API server
- [ ] The triggerer
- [x] The DAG processor
- [ ] The metadata database

> Airflow 3 runs DAG parsing in its own service, the DAG processor. When a DAG does not appear, its logs and `airflow dags list-import-errors` are the first places to look.

### Which of these is an appropriate value to pass between tasks with XCom?

- [ ] A pandas DataFrame of all 26,779 order lines
- [x] A small dictionary of row counts, such as {"orders": 9521, "order_lines": 27995}
- [ ] The contents of the supplier's products.csv file
- [ ] A Parquet file read into memory

> XCom is stored in the metadata database, so it is for small values: counts, paths, keys and dates. Data belongs in storage, with tasks passing references to it.

### What makes it safe to backfill shoplink_daily_ingest for a week of past dates?

- [ ] Setting catchup=True
- [ ] Setting retries to zero
- [x] Every task is keyed on the run's logical date and is idempotent for that date
- [ ] Running the backfill with many active runs at once

> Each backfilled run passes its own logical date to the pipeline as the load date, and each step replaces that date's data rather than appending. Rerunning any date therefore cannot create duplicates.

### Why prefer a deferrable sensor to one in poke mode when waiting hours for a supplier file?

- [ ] It checks for the file more often
- [x] It hands the wait to the triggerer, so it holds no worker slot while waiting
- [ ] It does not need a timeout
- [ ] It retries automatically when the file is late

> A poke-mode sensor occupies a worker slot for its whole wait. A deferred task gives the wait to the lightweight triggerer service and only takes a slot again when the condition is met.

### ShopLink's leadership wants to know when the daily ingest is still not finished an hour after it started. What do you use in Airflow 3?

- [ ] A task SLA with sla=timedelta(hours=1)
- [ ] catchup=False
- [x] A DeadlineAlert on the DAG with a one-hour interval and a callback
- [ ] A pool with one slot

> Task SLAs were removed in Airflow 3.0. Deadline alerts, added in 3.1, call a callback when a Dag run passes a deadline measured from a reference such as when the run was queued.

# Project: The shoplink_daily_ingest DAG

max_score: 100

## Brief

ShopLink wants the pipeline you built in Module 6 to run every day without anyone touching it, and to recover from bad days on its own or with one command. Build an Airflow DAG, `shoplink_daily_ingest`, that runs every step of the Module 6 pipeline as its own task, in the right order, rebuilds Module 5's marts and the dbt models after each load, with retries and alerts, then prove it by backfilling a range of past dates.

Work in your `shoplink-data-platform` repository on a branch called `feature/airflow-orchestration`.

## Deliverables

1. **Airflow in Compose.** `compose.yaml` runs Airflow 3.x with `airflow-init`, `airflow-apiserver` (host port 8080), `airflow-scheduler`, `airflow-dag-processor` and `airflow-triggerer`, using `LocalExecutor` and the `airflow` database on your existing `postgres` service, plus a `mock-api` service that Airflow reaches at `http://mock-api:8000`. `airflow/Dockerfile` extends `apache/airflow` so tasks can import `pipelines` and run dbt. Secrets come from `.env`, and `.env.example` lists every new variable with placeholder values.
2. **The DAG.** `dags/shoplink_daily_ingest.py` with `schedule="@daily"`, `catchup=False`, `max_active_runs=1`, a UTC `start_date`, tags, and these tasks:
   - `extract_app_db`, `wait_for_supplier_file` (deferrable `FileSensor` with a timeout) then `extract_supplier_file`, and `extract_orders_api`, with the three extract branches running in parallel; `extract_supplier_file` passes an absolute path, `steps.extract_supplier_file(ds, f"/opt/airflow/data/incoming/supplier/{ds}/products.csv")`;
   - `validate`, which calls `steps.validate_bronze(ds, threshold=...)` with the `shoplink_quarantine_threshold` variable (default 0.02), so the run fails when the quarantine rate is above it;
   - `load_raw`, then `build_marts` (runs `sql/transforms/marts.sql` with `pipelines.db.connect`, mounted at `/opt/airflow/sql`), then `dbt_build` (`BashOperator`), then `quality_checks`, which runs at least three SQL checks through the `shoplink_warehouse` connection and fails if any fails.
   Every task is a thin wrapper around your Module 6 `pipelines/steps.py` functions, called with the run's logical date (`ds`). Only small values travel through XCom.
3. **Reliability.** `default_args` with at least 2 retries, a retry delay and an `execution_timeout`; `on_failure_callback` from `airflow/plugins/shoplink_alerts.py`; a `DeadlineAlert`; tasks that write to PostgreSQL (`validate`, `load_raw`, `build_marts`, `dbt_build`) use the `shoplink_postgres` pool.
4. **A backfill.** Supplier files in place for at least five consecutive past dates, and a backfill created with `airflow backfill create` over those dates, all runs green.
5. **README.** A section "Orchestration" covering: how to start Airflow, how to trigger one date, the exact backfill command you used, how to rerun a failed task, and a short runbook entry for "`extract_orders_api` failed after all retries".

## How to submit

Push the branch and open a pull request into `main`. Paste the pull request link into the submission form, and in the note add a link to a screenshot (for example uploaded to the pull request description, or an image in the repo) of the Grid view showing the green backfilled runs, plus anything you would like feedback on. Share your DAG for peer review if you would like a second opinion on the task design.

## Grading guide

| Criterion | Points |
|---|---|
| Airflow services in compose.yaml follow the official pattern, use LocalExecutor and the shared postgres, and keep secrets in .env | 15 |
| DAG structure: all steps as separate tasks, parallel extracts, correct dependencies, logical date passed to every step | 20 |
| Deferrable file sensor with a timeout; validation threshold read from a variable | 10 |
| Retries, execution timeout, failure callback and deadline alert are configured and demonstrated | 15 |
| dbt runs from Airflow and the quality checks fail the run when they should | 15 |
| Backfill over at least five dates with evidence of green runs | 15 |
| README and runbook entry are clear enough for someone else to operate the DAG | 10 |
