#!/usr/bin/env python3
"""Prompt -> mock HTTP model -> SQLite synchronization -> export integration."""
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio import Studio, Problem, dump, current_version, handoff_files, production_status


class Model(BaseHTTPRequestHandler):
    calls = []
    fault = ""

    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        Model.calls.append(request)
        prompt = request["messages"][-1]["content"]
        targets = json.loads(prompt.split("本批目标镜号：")[-1].splitlines()[0])
        video = "本次阶段：M03" in prompt
        rows = [{"key": key, "video_prompt" if video else "image_prompt": key + " 的完整生产正文",
                 "edit_notes" if video else "reference_notes": "保留原声备注" if video else "本体单视角用于形态，不复制拼板",
                 # Old custom templates may still return entire shots. These must not overwrite upstream.
                 "duration": 1, "dialogue": "错误的说话人", "order": 900,
                 "asset_ids": [], "action": "不应发生的动作"} for key in reversed(targets)]
        if targets[0] == "EP001-S007":
            if Model.fault == "missing":
                rows.pop()
            elif Model.fault == "duplicate":
                rows[-1] = rows[0]
        result = {"text": "根据提供的文字起点生成，尚未检查媒体。", "shots": rows, "assets": []}
        body = dump({"choices": [{"finish_reason": "stop", "message": {"content": dump(result)}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def main():
    with tempfile.TemporaryDirectory() as tmp:
        app = Studio(Path(tmp)/"data", Path(tmp)/"settings.json")
        model = ThreadingHTTPServer(("127.0.0.1", 0), Model)
        threading.Thread(target=model.serve_forever, daemon=True).start()
        settings = {"base_url": f"http://127.0.0.1:{model.server_port}/v1", "model": "mock", "max_tokens": 12000}
        app.save_settings(settings)
        pid = app.store.create({"name": "原创形态与分批验收", "track": "drama", "style": "二维赛璐璐"})["id"]

        def save(key, kind, content, deps=None, meta=None):
            state = app.store.snapshot(pid)
            old = next((e for e in state["entities"] if e["id"] == key), None)
            return app.store.save(pid, {"id": key, "kind": kind, "title": key, "episode": "EP001",
                "content": content, "deps": deps or [], "meta": meta or {}, "base_revision": old["head"] if old else 0,
                "set_current": True, "expected_accepted": old["accepted"] if old else None})

        def rejected(fn):
            try:
                fn()
            except Problem:
                return
            raise AssertionError("Expected rejection")

        def ref(v):
            return {"id": v["id"], "revision": v["revision"]}

        try:
            image = app.store.add_media(pid, "reference.png", io.BytesIO(b"image-fixture"), 13)["id"]
            role = save("CHAR-A", "asset", {"type": "角色", "description": "原创角色", "image_prompt": "三视图",
                        "media_ids": [image], "three_view_confirmed": True})
            form = save("FORM-A", "asset", {"type": "造型", "parent_asset_id": role["id"],
                        "form_description": "螳螂本体，六足和折叠翅", "media_ids": [],
                        "production_reference": {"media_ids": [image], "notes": "单只本体侧面，供结构参考"}})
            assert ref(role) in form["deps"]
            save("CHAR-UNUSED", "asset", {"type": "角色", "description": "本集不出现，尚无参考图"})
            script = save("stage-M00-EP001", "stage", {"text": "# 原创剧本\n【场景1 走廊 / 夜】\n甲：「别动。」"})
            rows = [{"key": f"EP001-S{i+1:03}", "duration": 5, "order": i, "dialogue": "甲：「别动。」",
                     "start": "门外持信", "action": "抬起捕捉足", "end": "停在门外", "camera": "中景固定",
                     "composition": "门在右侧", "lighting": "左侧走廊顶灯", "continuity": "未进入房间",
                     "image_prompt": "", "video_prompt": "", "edit_notes": "门轴声保留在后期",
                     "asset_ids": [form["id"]]} for i in range(30)]
            storyboard = save("stage-M01-EP001", "stage", {"text": "按原剧本拆镜", "structured": {"shots": rows, "assets": []}}, [ref(script)])
            assert app.store.sync_stage(pid, ref(storyboard))["count"] == 30
            first = next(e for e in app.store.snapshot(pid)["entities"] if e["id"] == rows[0]["key"])
            first_v = current_version(first)
            save(first["id"], "shot", dict(first_v["content"], bindings={"first_frame": image}), first_v["deps"])
            status = production_status(app.store.snapshot(pid), "EP001")
            assert status["stages"][2]["ready"], status["issues"]
            ids = [s["key"] for s in reversed(rows)]
            inputs = {"stage": "M02", "episode": "EP001", "context_ids": ids + ["CHAR-UNUSED"],
                      "source_ids": [], "media_ids": []}
            built = app.compose(pid, inputs)
            assert len(built["batches"]) == 5 and built["shot_keys"] == list(reversed(ids))
            assert built["max_tokens"] == 12000
            assert all(len(b["shot_keys"]) == 6 for b in built["batches"])
            assert '"id": "CHAR-UNUSED"' not in built["prompt"]
            assert '"parent_asset_id": "CHAR-A"' in built["prompt"] and "单只本体侧面" in built["prompt"]
            assert all(b["prompt"] in built["prompt"] for b in built["batches"])
            before = {e["id"]: current_version(e)["content"] for e in app.store.snapshot(pid)["entities"] if e["kind"] == "shot"}
            result = app.generate(pid, {"input": inputs, "preview_hash": built["hash"]})
            assert not result["error"], result["error"]
            assert [c["messages"][-1]["content"] for c in Model.calls] == [b["prompt"] for b in built["batches"]]
            assert all(c["max_tokens"] == 12000 for c in Model.calls)
            assert [s["key"] for s in result["result"]["shots"]] == built["shot_keys"]
            stage = save("stage-M02-EP001", "stage", {"text": result["result"]["text"], "structured": result["result"]},
                         built["deps"], {"preview": {"shot_keys": built["shot_keys"]}})
            assert app.store.sync_stage(pid, ref(stage))["count"] == 30
            state = app.store.snapshot(pid)
            for e in state["entities"]:
                if e["kind"] == "shot":
                    c = current_version(e)["content"]
                    assert all(c[k] == val for k, val in before[e["id"]].items() if k != "image_prompt"), (e["id"], c)
                    assert c["image_prompt"] == e["id"] + " 的完整生产正文"
            print("PASS 30 shots / 5 exact preview batches, 12000-token budget, preserved upstream and real bindings")

            video_input = dict(inputs, stage="M03")
            video_preview = app.compose(pid, video_input)
            video_result = app.generate(pid, {"input": video_input, "preview_hash": video_preview["hash"]})
            video_stage = save("stage-M03-EP001", "stage", {"text": video_result["result"]["text"], "structured": video_result["result"]},
                               video_preview["deps"], {"preview": {"shot_keys": video_preview["shot_keys"]}})
            app.store.sync_stage(pid, ref(video_stage))
            c = current_version(next(e for e in app.store.snapshot(pid)["entities"] if e["id"] == ids[0]))["content"]
            assert c["image_prompt"] and c["video_prompt"] and c["dialogue"] == rows[0]["dialogue"]
            assert "门轴声保留在后期" in c["edit_notes"]
            exported, media = handoff_files(app.store.snapshot(pid), "EP001")
            assert "FORM-A" in exported["prompts.md"] and "CHAR-A" in exported["assets.md"] and image in media
            assert "单人生产参考" in exported["assets.md"] and "未进入房间" in exported["prompts.md"]
            print("PASS M03 patches, role/form linkage, selected references and delivery provenance")

            for fault in ("missing", "duplicate"):
                Model.fault = fault
                preview = app.compose(pid, inputs)
                failed = app.generate(pid, {"input": inputs, "preview_hash": preview["hash"]})
                assert failed["error"] and failed["result"] is None and len(failed["run"]["content"]["batch_runs"]) == 5
                assert len(json.loads(failed["run"]["content"]["text"])["shots"]) == 24
                bad_ref = failed["run"]["content"]["batch_runs"][1]
                batch_run = current_version(next(e for e in app.store.snapshot(pid)["entities"] if e["id"] == bad_ref["id"]))
                assert batch_run["content"]["status"] == "failed" and batch_run["content"]["text"]
                incomplete = save("stage-M02-EP001", "stage", {"structured": json.loads(failed["run"]["content"]["text"]), "text": "待修"},
                                  preview["deps"], {"preview": {"shot_keys": preview["shot_keys"]}})
                rejected(lambda: app.store.sync_stage(pid, ref(incomplete)))
            Model.fault = ""
            print("PASS missing/duplicate shots fail explicitly, all batch records retained, incomplete sync rejected")

            custom = save("template-M02", "template", {"text": "项目自定义模板正文"})
            custom_preview = app.compose(pid, inputs)
            assert {"code": "M02", "source": "custom", "version": 1} in custom_preview["template_sources"]
            assert "项目自定义模板正文" in custom_preview["prompt"] and ref(custom) in custom_preview["deps"]
            app.save_settings(dict(settings, max_tokens=16000))
            rejected(lambda: app.generate(pid, {"input": inputs, "preview_hash": custom_preview["hash"]}))
            print("PASS custom-template provenance and changed-budget preview invalidation")
            save("FORM-A", "asset", dict(form["content"], form_description="后续新设定，不属于本次镜头"))
            old_export, _ = handoff_files(app.store.snapshot(pid), "EP001")
            assert "螳螂本体，六足和折叠翅" in old_export["assets.md"]
            assert "后续新设定，不属于本次镜头" not in old_export["assets.md"]
            print("PASS exported asset descriptions use the versions actually referenced by shots")
        finally:
            model.shutdown()
            model.server_close()


if __name__ == "__main__":
    main()
