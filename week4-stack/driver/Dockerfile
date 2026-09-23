# Driver and notebook environment, built on the same Spark version as the
# cluster in docker-compose.yml. Keep these two versions in step.
FROM apache/spark:3.5.3-python3

USER root

RUN pip install --no-cache-dir \
      jupyterlab==4.2.* \
      delta-spark==3.2.0 \
      kafka-python==2.0.* \
      boto3==1.34.* \
      duckdb==1.0.* \
      pandas==2.2.*

RUN mkdir -p /home/spark/work && chown -R spark:spark /home/spark

USER spark
WORKDIR /home/spark/work

EXPOSE 8888 4040

CMD ["jupyter", "lab", \
     "--ip=0.0.0.0", \
     "--port=8888", \
     "--no-browser", \
     "--ServerApp.token=", \
     "--ServerApp.password=", \
     "--ServerApp.root_dir=/home/spark/work"]
