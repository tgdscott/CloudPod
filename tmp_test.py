import psycopg
conn = psycopg.connect(host="35.199.190.50", port=5432, dbname="podcast", user="podcast", password="N6rW8s$1zQ@p")
with conn, conn.cursor() as cur:
    cur.execute("SELECT 1")
    print(cur.fetchone())
