#!/usr/bin/env python3
"""Run real HTTP + SQLite + ZIP + mock-model integration checks, without API fees."""
import base64
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio import Handler, Studio, dump


class Model(BaseHTTPRequestHandler):
    invalid = False
    last = None

    def do_POST(self):
        Model.last = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        text = Model.last["messages"][-1]["content"]
        if isinstance(text, list):
            text = text[0]["text"]
        result = {"text":"模型草稿，仅覆盖所选来源。","shots":[],"assets":[]}
        if "本次阶段：B04" in text:
            video = '"range": "video"' in text
            result = {"text":"按本次提供的描述创作。","image_prompt":"" if video else "保持人物身份，白色圆领毛衣，咖啡店窗边自然光。",
                      "video_prompt":"人物轻轻抬眼，微笑后自然停顿，固定镜头。" if video else ""}
        content = "```json\n" + dump(result) + "\n```"
        payload = {"choices":[{"message":{"content":content if not Model.invalid else "incomplete {"},
                               "finish_reason":"stop" if not Model.invalid else "length"}]}
        body = dump(payload).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def main():
    with tempfile.TemporaryDirectory() as temp:
        app = Studio(Path(temp)/"data", Path(temp)/"private/settings.json")
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        server.app = app
        model = ThreadingHTTPServer(("127.0.0.1", 0), Model)
        for service in (server, model):
            threading.Thread(target=service.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{server.server_port}"

        def request(path, data=None, *, raw=None, headers=None, expected=200):
            body = dump(data).encode() if data is not None else raw
            head = {"X-Studio-Token":app.token}
            if data is not None:
                head["Content-Type"] = "application/json"
            head.update(headers or {})
            req = Request(base+path, body, head)
            try:
                response = urlopen(req, timeout=10)
            except HTTPError as exc:
                response = exc
            with response:
                payload = response.read()
                assert response.status == expected, (path,response.status,payload[:300])
                if response.headers.get("Content-Type", "").startswith("application/json"):
                    return json.loads(payload)
                return payload

        try:
            bootstrap = request("/api/bootstrap")
            assert len(bootstrap["templates"]) == 17 and bootstrap["projects"] == []
            assert [s[0] for s in bootstrap["stages"][:4]] == ["M00","M01","M02","M03"]
            request("/api/projects", {"name":"blocked","track":"drama"}, headers={"Origin":"https://foreign.example"}, expected=403)
            request("/api/projects", {"name":"blocked","track":"drama"}, headers={"X-Studio-Token":""}, expected=403)
            request("/api/bootstrap", headers={"Host":"foreign.example"}, expected=403)
            request("/api/bootstrap", headers={"Sec-Fetch-Site":"cross-site"}, expected=403)
            print("PASS local-only access and write protection")

            p = request("/api/demo", {}, expected=201)
            path = "/api/projects/" + p["id"]
            state = request(path)
            assert len([e for e in state["entities"] if e["kind"]=="shot"]) == 3
            assert "待挂素材：first_frame" in state["checks"]["EP001-S001"]
            manga = request(path+"/compose", {"stage":"M01","episode":"EP001","scope":"P1–P3",
                "source_ids":["SRC-001"],"context_ids":[],"media_ids":[]})
            assert '"image_prompt":"","controlnet":"","video_prompt":""' in manga["prompt"]
            stage = next(e for e in state["entities"] if e["id"]=="stage-D01-EP001")
            revised_stage = request(path+"/save", {"id":stage["id"],"kind":"stage","title":stage["title"],
                "episode":"EP001","base_revision":1,"content":stage["versions"][0]["content"],
                "deps":stage["versions"][0]["deps"],"meta":{"preview":{"prompt":"INTERNAL_AUDIT_ONLY"*5000}}})
            request(path+"/accept", {"id":stage["id"],"revision":revised_stage["revision"],"expected_accepted":1})
            context = request(path+"/compose", {"stage":"D02","episode":"EP001","scope":"",
                "source_ids":["SRC-001"],"context_ids":["stage-D01-EP001"],"media_ids":[]})
            assert "INTERNAL_AUDIT_ONLY" not in context["prompt"] and context["characters"] < 80000
            asset = next(e for e in state["entities"] if e["id"]=="LOOK-LIN")
            v = request(path+"/save", {"id":asset["id"],"kind":"asset","title":asset["title"],"base_revision":1,
                "content":dict(asset["versions"][0]["content"],description="同款围裙，袖口卷起"),"deps":asset["versions"][0]["deps"]})
            request(path+"/save", {"id":asset["id"],"kind":"asset","base_revision":1,"content":{}}, expected=409)
            assert not any("修表工作服" in r for r in request(path)["checks"]["EP001-S001"])
            request(path+"/accept", {"id":asset["id"],"revision":v["revision"],"expected_accepted":1})
            assert any("修表工作服" in r for r in request(path)["checks"]["EP001-S001"])
            # An unrelated asset has no influence on the three shots.
            unrelated = request(path+"/save", {"kind":"asset","title":"未使用道具","content":{"description":"一只茶杯","media_ids":[]}})
            request(path+"/accept", {"id":unrelated["id"],"revision":1,"expected_accepted":None})
            assert not any("茶杯" in r for r in request(path)["checks"]["EP001-S001"])
            print("PASS revisions, concurrent-edit conflict and dependency propagation")

            # A tiny valid PNG is only a test fixture, never a shipped UI illustration.
            png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=")
            image = request(path+"/upload", raw=png, headers={"X-Filename":"reference.png"}, expected=201)
            good = request(path+"/upload", raw=b"chosen-video-bytes", headers={"X-Filename":"chosen.mp4"}, expected=201)
            bad = request(path+"/upload", raw=b"rejected-video-bytes", headers={"X-Filename":"rejected.mp4"}, expected=201)
            assert request(path+"/media/"+good["id"], headers={"Range":"bytes=0-5"}, expected=206) == b"chosen"
            request(path+"/upload", raw=b"<script/>", headers={"X-Filename":"bad.html"}, expected=400)
            shot = next(e for e in request(path)["entities"] if e["id"]=="EP001-S001")
            profile = request(path+"/save", {"kind":"profile","title":"实测测试档案","content":{"mode":"i2v","verification":"verified",
                "slots":[{"name":"first_frame","type":"image","required":False}],"capabilities":{"negative_prompt":False}}})
            request(path+"/accept", {"id":profile["id"],"revision":1,"expected_accepted":None})
            clean = request(path+"/save", {"id":"SHOT-CLEAN","kind":"shot","title":"=SUM(A1:A2)","episode":"EP001",
                "content":{"duration":5,"video_prompt":"转头看向左侧","negative_prompt":"不应导出","bindings":{}},
                "deps":[{"id":profile["id"],"revision":1}]})
            request(path+"/accept", {"id":clean["id"],"revision":1,"expected_accepted":None})
            assert "待挂素材：first_frame" in request(path)["checks"]["SHOT-CLEAN"]
            clean2 = request(path+"/save", {"id":"SHOT-CLEAN","kind":"shot","title":"=SUM(A1:A2)","episode":"EP001","base_revision":1,
                "content":dict(clean["content"],bindings={"first_frame":image["id"]}),"deps":clean["deps"]})
            request(path+"/accept", {"id":clean2["id"],"revision":2,"expected_accepted":1})
            assert request(path)["checks"]["SHOT-CLEAN"] == []
            print("PASS media upload, seek ranges and truthful production readiness")

            def attempt(result, judgment, inspected):
                return request(path+"/save", {"kind":"attempt","episode":"EP001","title":"试片",
                    "content":{"prompt_ref":{"id":"SHOT-CLEAN","revision":2},"actual_prompt":"转头看向左侧",
                               "input_media":[image["id"]],"result_media":[result["id"]] if result else [],
                               "judgment":judgment,"user_reviewed":inspected,"feedback":"人工记录"},
                    "deps":[{"id":"SHOT-CLEAN","revision":2},{"id":profile["id"],"revision":1}]})
            failure = attempt(bad,"rejected",True)
            request(path+"/select", {"id":failure["id"],"revision":1,"expected":None}, expected=400)
            unreviewed = attempt(None,"accepted",False)
            request(path+"/select", {"id":unreviewed["id"],"revision":1,"expected":None}, expected=400)
            success = attempt(good,"accepted",True)
            request(path+"/select", {"id":success["id"],"revision":1,"expected":None})
            handoff = request(path+"/handoff")
            with zipfile.ZipFile(io.BytesIO(handoff)) as z:
                assert "assets.md" in z.namelist()
                assert "media/"+good["filename"] in z.namelist()
                assert "media/"+bad["filename"] not in z.namelist()
                assert "不应导出" not in z.read("prompts.md").decode()
                assert "'=SUM(A1:A2)" in z.read("shots.csv").decode()
                assert json.loads(z.read("manifest.json"))["shots"][-1]["selected"]["id"] == success["id"]
            print("PASS selected-take provenance, rejected-take exclusion and CSV safety")

            settings = {"base_url":f"http://127.0.0.1:{model.server_port}/v1","model":"mock-text",
                        "vision_model":"mock-vision","api_key":"test-secret-not-for-export"}
            request("/api/settings", settings)
            public = request("/api/bootstrap")["settings"]
            assert public["has_key"] and "api_key" not in public
            input_data = {"stage":"D05","episode":"EP001","scope":"P1–P3","source_ids":["SRC-001"],
                          "context_ids":["stage-D03-EP001"],"media_ids":[],"extra":"只生成三镜"}
            preview = request(path+"/compose", input_data)
            assert "{{" not in preview["prompt"] and "P1–P3" in preview["prompt"]
            request(path+"/generate", {"input":input_data,"preview_hash":"stale"}, expected=409)
            result = request(path+"/generate", {"input":input_data,"preview_hash":preview["hash"]})
            assert not result["error"] and result["run"]["meta"]["input_hash"] == preview["hash"]
            Model.invalid = True
            result = request(path+"/generate", {"input":input_data,"preview_hash":preview["hash"]})
            assert result["error"] and result["run"]["content"]["text"] == "incomplete {"
            request(path+"/accept", {"id":result["run"]["id"],"revision":1,"expected_accepted":None}, expected=400)
            Model.invalid = False
            image_input = dict(input_data,media_ids=[image["id"]])
            preview = request(path+"/compose", image_input)
            result = request(path+"/generate", {"input":image_input,"preview_hash":preview["hash"]})
            assert not result["error"] and Model.last["model"] == "mock-vision"
            assert Model.last["max_tokens"] == 4096
            assert Model.last["response_format"] == {"type":"json_object"}
            assert Model.last["messages"][1]["content"][1]["image_url"]["url"].startswith("data:image/png;base64,")
            print("PASS exact AI input preview, mock text/vision and retained truncated output")

            historical = request(path+"/compose", {"stage":"D03","episode":"EP001",
                "source_ids":["SRC-001"],"context_ids":["stage-D03-EP001"],"media_ids":[]})
            assert historical["deps"][1]["frozen"] is True
            revised = request(path+"/save", {"id":"stage-D03-EP001","kind":"stage",
                "title":"分集剧本","episode":"EP001","base_revision":1,
                "content":{"text":"以旧版为参考的新剧本"},"deps":historical["deps"]})
            request(path+"/accept", {"id":revised["id"],"revision":2,"expected_accepted":1})
            assert request(path)["checks"]["stage-D03-EP001"] == []
            print("PASS previous-stage context is frozen without self-invalidating the new revision")

            backup = request(path+"/backup")
            restored = request("/api/restore", raw=backup, expected=201)
            assert restored["id"] != p["id"]
            original = request(path)
            copied = request("/api/projects/"+restored["id"])
            assert copied["entities"] == original["entities"] and copied["media"] == original["media"]
            assert copied["events"] == original["events"] and copied["selected"] == original["selected"]
            assert len(app.store.list_projects()) == 2
            with zipfile.ZipFile(io.BytesIO(backup)) as z:
                assert b"test-secret-not-for-export" not in z.read("project.json")
                source = {name:z.read(name) for name in z.namelist()}
            def modified(entries):
                out=io.BytesIO()
                with zipfile.ZipFile(out,"w") as z:
                    for name,body in entries.items():
                        z.writestr(name,body)
                return out.getvalue()
            request("/api/restore", raw=modified(dict(source, **{"../escape.txt":b"no"})), expected=400)
            tampered = dict(source)
            tampered["media/"+image["filename"]] = b"wrong"
            request("/api/restore", raw=modified(tampered), expected=400)
            unsafe = json.loads(source["project.json"])
            unsafe["media"][0]["filename"] = "../../settings.json"
            request("/api/restore", raw=modified(dict(source, **{"project.json":dump(unsafe).encode()})), expected=400)
            assert len(app.store.list_projects()) == 2
            reloaded = Studio(Path(temp)/"data",Path(temp)/"private/settings.json")
            assert reloaded.store.snapshot(p["id"])["entities"] == original["entities"]
            print("PASS backup round-trip, restart persistence, ZIP traversal/tamper rejection and secret exclusion")

            disposable = request("/api/projects", {"name":"待删除项目","track":"drama"}, expected=201)
            delete_path = "/api/projects/" + disposable["id"]
            material = request(delete_path+"/save", {"id":"SRC-DELETE","kind":"source","title":"废弃素材",
                "content":{"text":"v1","locator":"test","rights":"","reviewed":True,"media_ids":[]}})
            request(delete_path+"/accept", {"id":material["id"],"revision":1,"expected_accepted":None})
            material = request(delete_path+"/save", {"id":"SRC-DELETE","kind":"source","title":"废弃素材",
                "base_revision":1,"content":{"text":"v2","locator":"test","rights":"","reviewed":True,"media_ids":[]}})
            request(delete_path+"/accept", {"id":material["id"],"revision":2,"expected_accepted":1})
            deleted_version = request(delete_path+"/delete-version", {"id":"SRC-DELETE","revision":1})
            assert [v["revision"] for v in request(delete_path)["entities"][0]["versions"]] == [1,2]
            assert request(delete_path)["trash"][0]["revision"] == 1
            request("/api/trash/restore", {"id":deleted_version["id"]})
            request(delete_path+"/delete-version", {"id":"SRC-DELETE","revision":2}, expected=400)
            downstream = request(delete_path+"/save", {"kind":"stage","title":"引用素材","content":{"text":"draft"},
                "deps":[{"id":"SRC-DELETE","revision":2}]})
            request(delete_path+"/accept", {"id":downstream["id"],"revision":1,"expected_accepted":None})
            request(delete_path+"/delete-entity", {"id":"SRC-DELETE","confirmation":"废弃素材"}, expected=400)
            media = request(delete_path+"/upload", raw=png, headers={"X-Filename":"delete-with-project.png"}, expected=201)
            assert (app.store.path/disposable["id"]/media["filename"]).is_file()
            request(delete_path+"/delete", {"confirmation":"错误名称"}, expected=400)
            deleted_project = request(delete_path+"/delete", {"confirmation":"待删除项目"})
            request(delete_path, expected=404)
            assert (app.store.path/disposable["id"]).exists()
            request("/api/trash/purge", {"id":deleted_project["id"], "confirmation":"待删除项目"})
            assert not (app.store.path/disposable["id"]).exists()
            print("PASS safe project, source and discarded-version deletion")

            beauty = request("/api/projects", {"name":"人物作品","track":"beauty"}, expected=201)
            bp = "/api/projects/" + beauty["id"]
            bm = request(bp+"/upload", raw=png, headers={"X-Filename":"portrait.png"}, expected=201)
            work = request(bp+"/save", {"id":"WORK-1","kind":"shot","title":"咖啡店","episode":"WORK-1",
                "content":{"workflow":"beauty","mode":"daily","idea":"咖啡店窗边","duration":5,
                           "image_prompt":"白色毛衣，自然光","video_prompt":"","input_media":[],"bindings":{}}})
            request(bp+"/accept", {"id":work["id"],"revision":1,"expected_accepted":None})
            assert request(bp)["checks"]["WORK-1"] == []  # No ComfyUI profile or video required.
            shot_ref = {"id":work["id"],"revision":1}
            image_take = request(bp+"/save", {"kind":"attempt","title":"满意的图片",
                "content":{"medium":"image","prompt_ref":shot_ref,"result_media":[bm["id"]],
                           "platform":"公开平台","judgment":"accepted","user_reviewed":True},"deps":[shot_ref]})
            request(bp+"/accept", {"id":image_take["id"],"revision":1,"expected_accepted":None})
            image_ref = {"id":image_take["id"],"revision":1}
            request(bp+"/select", dict(image_ref,expected=None))
            current = request(bp)
            assert current["selected_images"]["WORK-1"] == image_ref and current["selected"] == {}
            binput = {"stage":"B04","episode":"WORK-1","scope":"video","context_ids":["WORK-1",image_take["id"]],
                      "source_ids":[],"media_ids":[bm["id"]]}
            bpreview = request(bp+"/compose", binput)
            bresult = request(bp+"/generate", {"input":binput,"preview_hash":bpreview["hash"]})
            assert not bresult["error"] and bresult["result"]["video_prompt"]
            assert '"shots":[]' not in bpreview["prompt"]
            video_work = request(bp+"/save", {"id":"WORK-1","kind":"shot","title":"咖啡店","episode":"WORK-1","base_revision":1,
                "content":dict(work["content"],video_prompt=bresult["result"]["video_prompt"],
                               video_source=image_ref,bindings={"first_frame":bm["id"]}),
                "deps":[dict(image_ref,frozen=True)]})
            request(bp+"/accept", {"id":"WORK-1","revision":2,"expected_accepted":1})
            assert request(bp)["checks"]["WORK-1"] == []
            invalid_source = dict(video_work["content"],video_source=shot_ref)
            request(bp+"/save", {"id":"WORK-1","kind":"shot","base_revision":2,"content":invalid_source}, expected=400)
            shot_ref = {"id":"WORK-1","revision":2}
            video_take = request(bp+"/save", {"kind":"attempt","title":"视频截图",
                "content":{"medium":"video","prompt_ref":shot_ref,"result_media":[bm["id"]],
                           "judgment":"accepted","user_reviewed":True},"deps":[shot_ref]})
            request(bp+"/select", {"id":video_take["id"],"revision":1,"expected":None})
            assert request(bp)["selected_images"]["WORK-1"] == image_ref
            with zipfile.ZipFile(io.BytesIO(request(bp+"/handoff"))) as archive:
                entry = json.loads(archive.read("manifest.json"))["shots"][0]
                assert entry["selected_image"] == image_ref
                assert entry["selected"]["id"] == video_take["id"]
                assert "media/"+bm["filename"] in archive.namelist()
            restored_beauty = request("/api/restore", raw=request(bp+"/backup"), expected=201)
            assert restored_beauty["track"] == "beauty"
            assert request("/api/projects/"+restored_beauty["id"])["selected_images"] == request(bp)["selected_images"]
            for track in ("daily","outfit","dance"):
                legacy = request("/api/projects", {"name":"旧人物项目","track":track}, expected=201)
                assert request("/api/restore",raw=request("/api/projects/"+legacy["id"]+"/backup"),expected=201)["track"] == track
            print("PASS beauty image-only completion, image/video provenance, generation and legacy restore")
            print("\nAll integration checks passed.")
        finally:
            for service in (server,model):
                service.shutdown()
                service.server_close()


if __name__ == "__main__":
    main()
