#!/usr/bin/env python3
"""SQLite/media integration for 30 shots x 4 candidates. No real provider calls."""
import io
import json
from pathlib import Path
import sys
import tempfile
import time
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio import Store, Problem, production_status, selected_takes, active_entities, stale_reasons, validate_backup


def main():
    with tempfile.TemporaryDirectory() as tmp:
        store = Store(tmp)
        p = store.create({"name": "生产验收", "track": "drama"})
        pid = p["id"]
        def save(id, kind, content, deps=None, base=0, current=True):
            return store.save(pid, {"id": id, "kind": kind, "title": id, "episode": "EP001", "content": content,
                                    "deps": deps or [], "base_revision": base, "set_current": current,
                                    "expected_accepted": base or None})
        def ref(v):
            return {"id": v["id"], "revision": v["revision"]}
        def blocked(fn):
            try:
                fn()
            except Problem:
                return
            raise AssertionError("Expected rejection")
        script = save("stage-M00-EP001", "stage", {"text": "甲：我们出发。"})
        shots = []
        rows = []
        for n in range(30):
            shot = save(f"EP001-S{n+1:03}", "shot", {"duration": 5, "start": "窗边", "dialogue": "我们出发",
                                                     "image_prompt": "窗边自然光", "video_prompt": "微笑", "order": n},
                        [ref(script)])
            shots.append(shot)
            for c in range(4):
                image = store.add_media(pid, f"{shot['id']}-v1-take{c}.png", io.BytesIO(b"test-image"), 10)
                rows.append({"media_id": image["id"], "prompt_ref": ref(shot), "medium": "image"})
        start = time.monotonic()
        batch = store.batch_attempts(pid, {"rows": rows})
        assert batch["count"] == 120
        assert len(active_entities(store.snapshot(pid), "attempt")) == 120
        store.batch_attempts(pid, {"rows": rows})
        assert len(active_entities(store.snapshot(pid), "attempt")) == 120
        invalid = [rows[0], dict(rows[1], media_id="missing")]
        blocked(lambda: store.batch_attempts(pid, {"rows": invalid}))
        direct_project = store.create({"name": "已筛选回填", "track": "drama"})
        direct_shot = store.save(direct_project["id"], {"id": "DIRECT-S001", "kind": "shot", "title": "直接选图",
            "episode": "EP001", "content": {"duration": 5, "image_prompt": "当前图片词"}, "set_current": True})
        direct_media = store.add_media(direct_project["id"], "DIRECT-S001.png", io.BytesIO(b"direct-image"), 12)
        direct_row = {"media_id": direct_media["id"], "prompt_ref": ref(direct_shot), "medium": "image"}
        direct = store.batch_attempts(direct_project["id"], {"rows": [direct_row], "select_current": True})
        direct_state = store.snapshot(direct_project["id"])
        assert direct["selected"] == 1 and selected_takes(direct_state, "image")["DIRECT-S001"]["id"] == direct["items"][0]["id"]
        store.batch_attempts(direct_project["id"], {"rows": [direct_row], "select_current": True})
        assert len(active_entities(store.snapshot(direct_project["id"]), "attempt")) == 1
        duplicate_media = store.add_media(direct_project["id"], "DIRECT-S001-alt.png", io.BytesIO(b"alternate"), 9)
        blocked(lambda: store.batch_attempts(direct_project["id"], {"rows": [
            direct_row, {"media_id": duplicate_media["id"], "prompt_ref": ref(direct_shot), "medium": "image"}],
            "select_current": True}))
        store.save(direct_project["id"], {"id": direct_shot["id"], "kind": "shot", "title": "直接选图",
            "episode": "EP001", "base_revision": 1, "content": {"duration": 5, "image_prompt": "新版图片词"},
            "set_current": True, "expected_accepted": 1})
        blocked(lambda: store.batch_attempts(direct_project["id"], {"rows": [direct_row], "select_current": True}))
        print("PASS pre-screened batch can directly set one current result per shot")
        for n, shot in enumerate(shots):
            take = batch["items"][n*4]["id"]
            selected = store.review_attempt(pid, {"id": take, "revision": 1, "judgment": "accepted", "expected": None})
            shots[n] = save(shot["id"], "shot", dict(shot["content"], bindings={"first_frame": rows[n*4]["media_id"]},
                                                   video_source=ref(selected)),
                            [ref(script), dict(ref(selected), frozen=True)], 1)
        assert production_status(store.snapshot(pid), "EP001")["stages"][2]["ready"]
        for shot in shots:
            video = store.add_media(pid, shot["id"]+".mp4", io.BytesIO(b"test-video"), 10)
            take = store.batch_attempts(pid, {"rows": [{"media_id": video["id"], "prompt_ref": ref(shot), "medium": "video"}]})["items"][0]["id"]
            store.review_attempt(pid, {"id": take, "revision": 1, "judgment": "accepted", "expected": None})
        assert production_status(store.snapshot(pid), "EP001")["stages"][3]["ready"]
        assert not production_status(store.snapshot(pid), "EP001")["ready"]
        for shot in shots:
            save("voice-"+shot["id"], "voice", {"shot_ref": ref(shot), "no_voice": True, "media_ids": [], "lines": []}, [ref(shot)])
        status = production_status(store.snapshot(pid), "EP001")
        assert status["ready"], status["issues"]
        voice_file = store.add_media(pid, "voice.wav", io.BytesIO(b"voice-data"), 10)
        save("voice-"+shots[0]["id"], "voice", {"shot_ref": ref(shots[0]), "no_voice": False, "media_ids": [voice_file["id"]],
              "lines": [{"text": "我们出发", "speaker": "甲", "start": .5, "end": 3.5}]}, [ref(shots[0])], 1)
        other = store.save(pid, {"id": "EP002-S001", "kind": "shot", "episode": "EP002", "content": {"duration": 5}})
        with store.export(pid, True, "EP001", checked=True) as file, zipfile.ZipFile(file) as z:
            manifest = json.loads(z.read("manifest.json"))
            assert len(manifest["shots"]) == 30
            assert "00:00:00,500 --> 00:00:03,500" in z.read("subtitles.srt").decode()
            assert "media/"+voice_file["filename"] in z.namelist()
        # Draft/current changes, quick selection conflicts and stale output detection.
        updated = save(shots[0]["id"], "shot", dict(shots[0]["content"], image_prompt="全新构图"), shots[0]["deps"], 2, False)
        assert not production_status(store.snapshot(pid), "EP001")["ready"]
        blocked(lambda: save(shots[0]["id"], "shot", updated["content"], [], 1))
        selected = selected_takes(store.snapshot(pid), "image")[shots[1]["id"]]
        blocked(lambda: store.review_attempt(pid, dict(selected, judgment="accepted", expected=None)))
        rejected = store.review_attempt(pid, dict(selected, judgment="discarded", expected=selected))
        assert shots[1]["id"] not in selected_takes(store.snapshot(pid), "image")
        print(f"PASS 30 shots / 120 candidates, batch retries, quick reviews, delivery scope and audio ({time.monotonic()-start:.2f}s)")
        # Soft deletion keeps all bytes; restore preserves IDs and versions.
        src = save("SRC-DELETE", "source", {"text": "原文"})
        src2 = save("SRC-DELETE", "source", {"text": "修订"}, [], 1)
        trash = store.delete_version(pid, {"id": src["id"], "revision": 1})
        assert len(next(e for e in store.snapshot(pid)["entities"] if e["id"] == src["id"])["versions"]) == 2
        store.restore_trash({"id": trash["id"]})
        unused = save("UNUSED", "source", {"text": "未使用"})
        discarded = store.delete_entity(pid, {"id": unused["id"], "confirmation": unused["id"]})
        assert not any(e["id"] == unused["id"] for e in active_entities(store.snapshot(pid)))
        with store.export(pid) as file:
            restored = store.restore(file)
        assert store.snapshot(restored["id"])["trash"]
        store.restore_trash({"id": discarded["id"]})
        assert any(e["id"] == unused["id"] for e in active_entities(store.snapshot(pid)))
        nested = save("PURGE-NESTED", "source", {"text": "v1"})
        save(nested["id"], "source", {"text": "v2"}, base=1)
        store.delete_version(pid, {"id": nested["id"], "revision": 1})
        whole = store.delete_entity(pid, {"id": nested["id"], "confirmation": nested["id"]})
        store.purge_trash({"id": whole["id"], "confirmation": nested["id"]})
        assert not any(t["target"] == nested["id"] for t in store.snapshot(pid)["trash"])
        trash_project = store.delete_project(pid, p["name"])
        assert (Path(tmp)/pid/voice_file["filename"]).exists()
        blocked(lambda: store.snapshot(pid))
        store.restore_trash({"id": trash_project["id"]})
        assert len(store.snapshot(pid)["entities"]) > 150
        disposable = store.create({"name": "可永久清空", "track": "beauty"})
        file = store.add_media(disposable["id"], "image.png", io.BytesIO(b"x"), 1)
        trash = store.delete_project(disposable["id"], disposable["name"])
        store.purge_trash({"id": trash["id"], "confirmation": disposable["name"]})
        assert not (Path(tmp)/disposable["id"]).exists()
        print("PASS recoverable deletion, retained media, trash backup and explicit purge")
        character = save("CHAR", "asset", {"type": "角色", "description": "黑发", "media_ids": [rows[0]["media_id"]]})
        dest = store.create({"name": "跨项目复用", "track": "beauty"})
        cloned = store.import_library(dest["id"], {"project": pid, **ref(character)})
        assert cloned["content"]["media_ids"] != character["content"]["media_ids"]
        assert store.media_file(dest["id"], cloned["content"]["media_ids"][0])[0].read_bytes() == b"test-image"
        template = save("template-M00", "template", {"text": "剧本模板"})
        imported = store.import_library(dest["id"], {"project": pid, **ref(template)})
        imported_again = store.import_library(dest["id"], {"project": pid, **ref(template)})
        assert imported["id"] == imported_again["id"] == template["id"] and imported_again["revision"] == 2
        assert any(item["title"] == "CHAR" for item in store.library())
        validate_backup(store.snapshot(pid))
        print("PASS shared library snapshots and independent media")
        # Stage synchronization must be all-or-nothing and retain existing real bindings.
        original = shots[2]
        current = next(e for e in store.snapshot(pid)["entities"] if e["id"] == original["id"])
        content = dict(current["versions"][-1]["content"])
        bad = save("stage-M02-EP001", "stage", {"text": "sync", "structured": {"shots": [
            {"key": original["id"], "duration": 5, "image_prompt": "同步的新图片词", "bindings": {}},
            {"key": "BAD-SHOT", "duration": -1}]}})
        blocked(lambda: store.sync_stage(pid, ref(bad)))
        assert next(e for e in store.snapshot(pid)["entities"] if e["id"] == original["id"])["head"] == current["head"]
        good = save("stage-M02-EP001", "stage", {"text": "sync", "structured": {"shots": [
            {"key": original["id"], "duration": 5, "image_prompt": "同步的新图片词", "bindings": {}}]}}, base=1)
        store.sync_stage(pid, ref(good))
        after = next(e for e in store.snapshot(pid)["entities"] if e["id"] == original["id"])
        assert after["versions"][-1]["content"]["bindings"] == content["bindings"]
        chosen = selected_takes(store.snapshot(pid), "image")[original["id"]]
        take = next(e for e in store.snapshot(pid)["entities"] if e["id"] == chosen["id"])
        reviewed = store.review_attempt(pid, dict(id=take["id"], revision=take["head"], judgment="accepted",
                                                  expected=chosen, revalidate=True))
        assert reviewed["content"]["prompt_ref"]["revision"] == 1
        assert reviewed["content"]["reviewed_against"]["revision"] == after["head"]
        assert not any(i["step"] == 2 and i["id"] == original["id"] for i in production_status(store.snapshot(pid), "EP001")["issues"])
        loop_asset = save("LOOP-ASSET", "asset", {"type": "角色", "description": "初版", "media_ids": []})
        loop_shot = save("LOOP-SHOT", "shot", {"duration": 5, "image_prompt": "初版图片词"}, [ref(loop_asset)])
        loop_stage = save("stage-M02-LOOP", "stage", {"text": "批量图片词", "structured": {"shots": [
            {"key": loop_shot["id"], "duration": 5, "image_prompt": "生成后的图片词"}],
            "assets": [{"key": loop_asset["id"], "type": "角色", "description": "不应由 M02 更新"}]}},
            [ref(loop_asset), ref(loop_shot)])
        store.sync_stage(pid, ref(loop_stage))
        state = store.snapshot(pid)
        synced = next(e for e in state["entities"] if e["id"] == loop_shot["id"])["versions"][-1]
        assert next(e for e in state["entities"] if e["id"] == loop_asset["id"])["head"] == 1
        assert synced["deps"][0].get("frozen") is True and not stale_reasons(state, synced)
        save(loop_asset["id"], "asset", {"type": "角色", "description": "新版", "media_ids": []}, base=1)
        assert stale_reasons(store.snapshot(pid), synced) == ["LOOP-ASSET 已有不同的当前版本"]
        print("PASS atomic stage synchronization, preserved bindings, no dependency loop and explicit old-result revalidation\nAll production checks passed.")


if __name__ == "__main__":
    main()
