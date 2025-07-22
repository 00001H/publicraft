#!/home/marr-ales-fios/python/bin/python
from threading import Lock
import cloudscraper
import subprocess
import signal
import json
import sys
import os
from typing import BinaryIO
from urllib.parse import urlparse,parse_qs,quote_plus as qp
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from traceback import print_exc
InterruptQuery = object()
def wtstr(stream: BinaryIO,s: str,*,length: int=8):
    b = s.encode()
    stream.write(len(b).to_bytes(length,"little"))
    stream.write(b)
def rdstr(stream: BinaryIO):
    ln = int.from_bytes(stream.read(8),"little")
    return stream.read(ln).decode()
class DatabaseBackend:
    def __init__(self):
        self.proc = subprocess.Popen(os.path.join(os.getcwd(),"bin/main"),stdin=subprocess.PIPE,stdout=subprocess.PIPE)
    def add(self,name: str,icon: str,discoverer: str):
        self.proc.stdin.write(b"c")
        wtstr(self.proc.stdin,name)
        wtstr(self.proc.stdin,icon)
        wtstr(self.proc.stdin,discoverer)
        self.proc.stdin.flush()
    def query(self,kw: str):
        self.proc.stdin.write(b"l")
        wtstr(self.proc.stdin,kw)
        self.proc.stdin.flush()
        while True:
            name = rdstr(self.proc.stdout)
            if not name:
                break
            icon = rdstr(self.proc.stdout)
            discoverer = rdstr(self.proc.stdout)
            if (yield (name,icon,discoverer)) is InterruptQuery:
                self.proc.send_signal(signal.SIGINT)
    def stop(self):
        self.proc.terminate()
sess = cloudscraper.create_scraper()
sess.headers["Referer"] = "https://neal.fun/infinite-craft/"
db = DatabaseBackend()
db.add("Water","💧","Neal Agarwal")
db.add("Fire","🔥","Neal Agarwal")
db.add("Wind","🌬️","Neal Agarwal")
db.add("Earth","🌍","Neal Agarwal")
def craft(f,s):
    resp = sess.get(f"http://neal.fun/api/infinite-craft/pair?first={qp(f)}&second={qp(s)}",timeout=1)
    if resp.status_code != 200:
        print(f"Error: bad status {resp.status_code}",file=sys.stderr)
        return None
    return resp.json()
def cli():
    me = "maf"
    while True:
        f,s = input("> ").split()
        if f == "$":
            for (name,icon,discoverer) in db.query(s):
                print(f"{icon} {name} (disc. by {discoverer})")
        else:
            resp = craft(f,s)
            if resp is not None:
                name = resp["result"]
                icon = resp["emoji"]
                discoverer = me if resp["isNew"] else "<unknown>"
                print(icon,name,discoverer)
                db.add(name,icon,discoverer)
errors = 0
def valid_ch(n: str):
    return n in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ .+_-~:;<>?\\/"
def un_ok(n: str):
    return (len(n) in range(2,64)
        and all(map(valid_ch,n)))
db_lock = Lock()
class InfiniteCraftRequestHandler(BaseHTTPRequestHandler):
    def __allow_cors(self):
        self.send_header("Access-Control-Allow-Origin","*")
    def __err(self,status: int,smsg: str,msg: str):
        self.send_response(status,smsg)
        self.__allow_cors()
        self.send_header("Content-Type","text/plain")
        self.end_headers()
        self.wfile.write(msg.encode())
        self.wfile.flush()
    def __ok_h(self,type: str):
        self.send_response(200,"OK")
        self.__allow_cors()
        self.send_header("Content-Type",type)
        self.end_headers()
    def __ok(self,type: str,data: bytes):
        self.__ok_h(type)
        self.wfile.write(data)
        self.wfile.flush()
    def do_GET(self):
        path = urlparse(self.path)
        if path.path == "/ping":
            self.__ok("text/plain",b"OK")
        elif path.path == "/craft":
            query = parse_qs(path.query)
            if "username" not in query:
                self.__err(400,"Bad Request","Bad username")
                return
            uname = query["username"][0]
            if not un_ok(uname):
                self.__err(400,"Bad Request","Bad username")
                return
            try:
                resp = craft(query["lhs"][0],query["rhs"][0])
                name = resp["result"]
                icon = resp["emoji"]
                discoverer = uname if resp["isNew"] else "<unknown>"
                db.add(name,icon,discoverer)
            except Exception:
                global errors
                errors += 1
                print(f"Error #{errors}:",file=sys.stderr)
                print_exc()
                self.__err(500,"Internal Server Error",f"#{errors}")
            else:
                self.__ok("text/json",json.dumps((name,icon,discoverer)).encode())
        elif path.path == "/search":
            query = parse_qs(path.query)
            if "kw" not in query:
                self.__err(400,"Bad Request","No keyword")
                return
            kw = query["kw"][0]
            if len(kw) not in range(1,1024):
                self.__err(400,"Bad Request","Invalid keyword")
                return
            with db_lock:
                self.__ok_h("application/json")
                it = db.query(kw)
                try:
                    while True:
                        res = next(it)
                        try:
                            wtstr(self.wfile,json.dumps(res),length=4)
                            self.wfile.flush()
                        except (IOError, OverflowError):
                            it.send(True)
                            break
                except StopIteration:
                    pass
        else:
            self.__err(400,"Bad Request","Illegal operation")
try:
    ThreadingHTTPServer(("",8080),InfiniteCraftRequestHandler).serve_forever()
except KeyboardInterrupt:
    pass
finally:
    db.stop()
