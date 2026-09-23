# Week 4 lakehouse stack

Everything Module 4 needs, running on one machine at no cost. No cloud account, trial clock or credit card.

## Bring it up

```bash
cd week4-stack
docker compose up -d --build          # core: MinIO, Spark, Kafka, driver
docker compose --profile governance up -d   # adds Unity Catalog and Marquez (section 5)
```

First run pulls images and builds the driver, so allow 10–15 minutes. After that it starts in under a minute.

## Where things are

| Service | URL | Notes |
| --- | --- | --- |
| JupyterLab (driver) | http://localhost:8888 | No token. Notebooks live in `week4-stack/work/` |
| Spark application UI | http://localhost:4040 | The one section 2 asks you to read. Only up while a job runs |
| Spark master UI | http://localhost:8080 | Confirm both workers registered before the tuning lab |
| MinIO console | http://localhost:9001 | `shoplink` / `shoplink123`. Browse `_delta_log` here |
| MinIO S3 API | http://localhost:9000 | What `s3a://` talks to |
| Kafka | `kafka:9092` inside the network, `localhost:9092` outside | |
| Marquez lineage | http://localhost:3000 | governance profile |
| Unity Catalog | http://localhost:8085 | governance profile |

## Buckets

`bronze`, `silver` and `gold` are created on startup by the `minio-init` service so the stack is usable from day one. In section 4 learners delete them and recreate them from code:

```bash
cd infra
export TF_VAR_minio_user=shoplink TF_VAR_minio_password=shoplink123
tofu init && tofu apply
```

## Resources

The full stack wants about 16 GB RAM. If a learner is short:

- Run without the governance profile except on section 5 day.
- Drop `spark-worker` to one replica — the shuffle is still real, just narrower.
- Close everything else. Spark, Kafka and MinIO together leave little room for a browser with forty tabs.
- As a last resort, pair two learners on one adequate machine for the Week 4 labs.

## Known snags

- **`apache/spark:3.5.3-python3` not found.** Some registries only carry the long form. Use `apache/spark:3.5.3-scala2.12-java11-python3-ubuntu` in both `docker-compose.yml` and `driver/Dockerfile`, and keep them identical.
- **Driver and executor version mismatch.** The driver image is built `FROM` the same Spark tag as the cluster for exactly this reason. If you bump one, bump both.
- **First Spark job is slow.** `spark.jars.packages` resolves the Delta and hadoop-aws jars from Maven on first use. They cache after that. It needs internet once.
- **`No FileSystem for scheme: s3a`.** The `spark-defaults.conf` mount did not land. Check it inside the container at `/opt/spark/conf/spark-defaults.conf`.

## Credentials

The MinIO credentials here are deliberately obvious teaching values and are hard-coded so the stack starts with no setup. They are safe only because nothing is exposed beyond localhost. Section 4 covers moving them to the CI secret store, and no learner should carry this pattern into real work.

## Status

This compose was written against image tags current in September 2026 but has **not been booted end to end** — no Docker was available on the machine that produced it. Run it once, pin the tags you land on, and correct anything the first run surfaces before a cohort starts.
