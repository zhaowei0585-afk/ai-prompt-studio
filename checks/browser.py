#!/usr/bin/env python3
"""Isolated browser acceptance: 30 shots, 120 candidates, both production lines."""
import base64
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import zipfile
from http.server import ThreadingHTTPServer

from playwright.sync_api import sync_playwright, expect

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio import Studio, Handler, selected_takes, production_status
from smoke import Model


def main():
    with tempfile.TemporaryDirectory() as temp:
        app = Studio(Path(temp)/"data", Path(temp)/"settings.json")
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        server.app = app
        model = ThreadingHTTPServer(("127.0.0.1", 0), Model)
        for service in (server, model):
            threading.Thread(target=service.serve_forever, daemon=True).start()
        app.save_settings({"base_url": f"http://127.0.0.1:{model.server_port}/v1", "model": "mock", "vision_model": "mock-vision"})
        project = app.store.create({"name": "三十镜生产验收", "track": "drama"})
        pid = project["id"]
        script = app.store.save(pid, {"id": "stage-M00-EP001", "kind": "stage", "title": "当前剧本",
            "episode": "EP001", "content": {"text": "原创人物在窗边读信。"}, "set_current": True})
        shots = []
        for i in range(30):
            shot = app.store.save(pid, {"id": f"EP001-S{i+1:03}", "kind": "shot", "title": f"读信镜头 {i+1}",
                "episode": "EP001", "content": {"duration": 5, "start": "窗边读信", "image_prompt": "静态读信",
                    "video_prompt": "缓缓抬眼", "order": i}, "set_current": True,
                "deps": [{"id": script["id"], "revision": 1}]})
            shots.append(shot)
        png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=")
        images = []
        for s in shots:
            for i in range(4):
                image = Path(temp)/f"{s['id']}-v1-take{i+1}.png"
                image.write_bytes(png)
                images.append(str(image))
        portrait = app.store.add_media(pid, "portrait.png", io.BytesIO(png), len(png))
        app.store.save(pid, {"id": "CHAR-1", "kind": "asset", "title": "共享原创人物",
            "content": {"type": "角色", "description": "成年人物，黑色齐肩发", "media_ids": [portrait["id"]]},
            "set_current": True})
        novel = Path(temp)/"第一章.txt"
        novel.write_text("雨夜里，她收到一封没有署名的信。", encoding="utf-8")
        errors = []
        dialogs = {"accept": True}
        try:
            with sync_playwright() as pw:
                browser = pw.chromium.launch(headless=True, channel=os.environ.get("PW_CHANNEL", "chrome"))
                page = browser.new_page(viewport={"width": 1440, "height": 1000},
                    permissions=["clipboard-read", "clipboard-write"])
                page.set_default_timeout(12000)
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.on("dialog", lambda dialog: dialog.accept() if dialogs["accept"] else dialog.dismiss())

                def click(action, key=None):
                    selector = f'[data-action="{action}"]'
                    if key is not None:
                        selector += f'[data-id="{key}"]'
                    page.locator(selector+":visible").last.click()
                    page.wait_for_function("() => !B.saving && !P.busy")

                def state():
                    return app.store.snapshot(page.locator("#project-select").input_value())

                def no_overflow():
                    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), page.evaluate("document.documentElement.scrollWidth")

                page.goto(f"http://127.0.0.1:{server.server_port}")
                page.wait_for_load_state("networkidle")
                expect(page.locator(".hero h2")).to_have_text("三十镜生产验收")
                assert page.locator("#nav button:visible").all_text_contents() == ["行动中心", "生产流程", "素材箱"]
                expect(page.get_by_text("项目详情与历史")).to_have_count(0)
                page.locator('[data-page="pipeline"]').click()
                expect(page.locator(".script-sources")).to_be_visible()
                page.locator("#text-input").set_input_files(str(novel))
                expect(page.locator('[name="source_type"]')).to_have_value("novel")
                page.locator('[name="reviewed"]').check()
                page.locator('#record-form button[value="current"]').click()
                expect(page.locator("#modal")).not_to_be_visible()
                click("script-source", "comic")
                page.locator('#record-form [name="title"]').fill("漫画第一页")
                page.locator('#record-form [name="text"]').fill("第一格：女孩在门口；第二格：她拆开信。")
                page.locator(f'#record-form [name="media_ids"][value="{portrait["id"]}"]').check()
                page.locator('[name="reviewed"]').check()
                page.locator('#record-form button[value="current"]').click()
                expect(page.locator("#modal")).not_to_be_visible()
                click("script-source", "joke")
                page.locator('#record-form [name="text"]').fill("他以为收到情书，打开后发现是催缴单。")
                page.locator('[name="reviewed"]').check()
                page.locator('#record-form button[value="current"]').click()
                expect(page.locator("#modal")).not_to_be_visible()
                expect(page.locator(".script-sources .queue-row")).to_have_count(3)
                expect(page.locator('#context-form [name="source_ids"]:checked')).to_have_count(3)
                expect(page.locator('#context-form [name="media_ids"]:checked')).to_have_count(1)
                click("compose")
                prompt = page.locator('[name="composed"]').input_value()
                assert all(f'"source_type": "{kind}"' in prompt for kind in ("novel", "comic", "joke"))
                assert "铺垫、误导、反转和包袱" in prompt
                click("close")
                page.set_viewport_size({"width": 390, "height": 844})
                no_overflow()
                assert page.locator(".flow-footer").evaluate("(e) => getComputedStyle(e).position") == "static"
                page.set_viewport_size({"width": 1440, "height": 1000})
                click("flow-step", "2")
                expect(page.locator(".flow-nav button")).to_have_count(6)
                assert page.locator(".flow-nav button").all_text_contents() == [
                    "✓编写剧本", "✓剧本分镜", "03文字生图", "04图生视频", "05人声配音", "06导出"]
                no_overflow()
                # Draft changes never replace the current version and can be cancelled on navigation.
                page.locator('#prompt-form [name="prompt"]').fill("新的图片提示词")
                dialogs["accept"] = False
                click("flow-step", "1")
                expect(page.locator('#prompt-form [name="prompt"]')).to_have_value("新的图片提示词")
                dialogs["accept"] = True
                click("prompt-save")
                expect(page.locator("#toast")).to_contain_text("草稿已保存")
                s = next(e for e in state()["entities"] if e["id"] == shots[0]["id"])
                assert s["head"] == 2 and s["accepted"] == 1
                click("flow-accept", s["id"])
                expect(page.locator("#toast")).to_contain_text("已设为当前版本")
                # Upload all 120 files in the same continuous page; explicit per-file versions.
                page.locator("#inbox-input").set_input_files(images)
                expect(page.locator("[data-map-shot]")).to_have_count(120, timeout=60000)
                assert page.locator("[data-map-shot]").first.input_value() == "EP001-S001"
                page.locator("[data-map-rev]").first.select_option("2")
                click("inbox-commit")
                expect(page.locator(".candidate")).to_have_count(120, timeout=30000)
                assert len([e for e in state()["entities"] if e["kind"] == "attempt"]) == 120
                # Same-shot comparison, differing prompt revisions, no modal-per-take workflow.
                page.locator('[name="compare-take"]').nth(0).check()
                page.locator('[name="compare-take"]').nth(1).check()
                click("compare-open")
                expect(page.locator(".compare-grid article")).to_have_count(2)
                expect(page.locator(".changed")).to_have_count(1)
                click("close")
                page.screenshot(path="/tmp/prompt-studio-batch-desktop.png", full_page=True)
                for s in shots:
                    page.locator('[name="gallery-shot"]').select_option(s["id"])
                    page.keyboard.press("a")
                    expect(page.locator(".candidate")).to_have_count(3)
                assert len(selected_takes(state(), "image")) == 30
                page.locator('[name="review-feedback"]').fill("手部形状错误，只修手部")
                click("review-reject")
                expect(page.locator(".candidate")).to_have_count(2)
                page.keyboard.press("x")
                expect(page.locator(".candidate")).to_have_count(1)
                print("PASS 120-file upload/mapping, draft/current semantics, 2-way diff, 30 selections, repair/discard", flush=True)
                click("flow-next")
                expect(page.locator('.flow-nav [aria-current="step"]')).to_contain_text("图生视频")
                # Real decodable video generated only as a disposable browser fixture.
                clip_bytes = bytes(page.evaluate("""async () => {
                    const c=document.createElement('canvas');c.width=64;c.height=64;
                    const ctx=c.getContext('2d'), stream=c.captureStream(10);
                    const r=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}), chunks=[];
                    r.ondataavailable=e=>chunks.push(e.data);
                    const stopped=new Promise(resolve=>r.onstop=resolve);r.start();
                    const timer=setInterval(()=>{ctx.fillStyle='#226f55';ctx.fillRect(0,0,64,64);},50);
                    setTimeout(()=>{clearInterval(timer);r.stop();stream.getTracks().forEach(t=>t.stop());},400);
                    await stopped;return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
                }"""))
                clips = []
                for s in shots:
                    clip = Path(temp)/(s["id"]+".webm")
                    clip.write_bytes(clip_bytes)
                    clips.append(str(clip))
                page.locator("#inbox-input").set_input_files(clips)
                expect(page.locator("[data-map-shot]")).to_have_count(30, timeout=30000)
                click("inbox-commit")
                expect(page.locator(".candidate")).to_have_count(30)
                for s in shots:
                    page.locator('[name="gallery-shot"]').select_option(s["id"])
                    page.keyboard.press("a")
                    expect(page.locator(".candidate")).to_have_count(0)
                click("flow-next")
                expect(page.locator("#voice-form")).to_be_visible()
                page.locator('[name="no_voice"]').check()
                click("voice-save")
                expect(page.locator("#toast")).to_contain_text("配音已保存")
                current = state()
                for s in [e for e in current["entities"] if e["kind"] == "shot"]:
                    if any(e["kind"] == "voice" and e["versions"][-1]["content"]["shot_ref"]["id"] == s["id"] for e in current["entities"]):
                        continue
                    ref = {"id": s["id"], "revision": s["accepted"]}
                    app.store.save(pid, {"kind": "voice", "title": s["title"]+"无配音", "episode": "EP001",
                        "content": {"shot_ref": ref, "no_voice": True, "media_ids": [], "lines": []},
                        "deps": [ref], "set_current": True})
                click("flow-next")
                expect(page.locator(".notice")).to_contain_text("检查通过")
                with page.expect_download() as download:
                    click("delivery-download")
                package = Path(temp)/"delivery.zip"
                download.value.save_as(package)
                with zipfile.ZipFile(package) as archive:
                    assert len(json.loads(archive.read("manifest.json"))["shots"]) == 30
                    assert "subtitles.srt" in archive.namelist()
                print("PASS 30 video selections, real video preview, voice stage and scoped delivery", flush=True)
                app.store.save(pid, {"id": script["id"], "kind": "stage", "title": "当前剧本", "episode": "EP001",
                    "base_revision": 1, "content": {"text": "原创人物在窗边读完信。"}, "set_current": True,
                    "expected_accepted": 1})
                page.reload()
                page.wait_for_load_state("networkidle")
                click("flow-step", "1")
                page.get_by_text("镜头顺序、人物与场景", exact=True).click()
                expect(page.locator(".stale-notice").first).to_contain_text("1 项上游内容已更新")
                expect(page.locator('[data-action="shot-refresh"]:visible').first).to_be_visible()
                click("shot-refresh")
                expect(page.locator('.flow-nav [aria-current="step"]')).to_contain_text("文字生图")
                expect(page.locator("#context-form")).to_be_visible()
                print("PASS compact stale warning and direct latest-content route", flush=True)
                # New single-work line: shared person -> topic -> prompt-to-video -> export.
                click("switch-space", "beauty")
                click("new-project")
                page.locator('#project-form [name="name"]').fill("今日视频验收")
                page.locator('#project-form button[type="submit"]').click()
                expect(page.locator("#modal")).not_to_be_visible()
                click("flow-step", "0")
                expect(page.locator(".flow-nav button")).to_have_count(4)
                click("workspace-library", "asset")
                click("library-import")
                expect(page.locator("#modal")).not_to_be_visible()
                page.locator('[name="character"]').select_option(index=1)
                click("beauty-save")
                expect(page.locator("#toast")).to_contain_text("草稿已保存")
                assert next(e for e in state()["entities"] if e["kind"] == "shot")["accepted"] is None
                click("flow-next")
                expect(page.locator("#modal")).to_be_visible()
                expect(page.locator("#modal")).to_contain_text("草稿尚未")
                click("close")
                click("flow-accept")
                click("flow-next")
                page.locator('[name="idea"]').fill("窗边读信后抬眼微笑")
                page.locator('[name="title"]').fill("今天的窗边")
                click("beauty-current")
                expect(page.locator("#toast")).to_have_text("已保存并设为当前版本")
                click("flow-next")
                expect(page.locator('[name="generation_route"]')).to_have_value("prompt")
                page.locator('[name="generation_route"]').select_option("reference")
                expect(page.locator('[name="reference_support"]')).to_be_visible()
                expect(page.locator("#beauty-form")).to_contain_text("参考视频、图片与动作标注")
                page.locator('[name="generation_route"]').select_option("i2v")
                expect(page.locator("#beauty-form")).to_contain_text("还没有当前首帧")
                page.locator('[name="generation_route"]').select_option("prompt")
                page.locator('[name="video_prompt"]').fill("人物读信后缓缓抬眼微笑，固定中景")
                click("beauty-current")
                expect(page.locator("#toast")).to_have_text("已保存并设为当前版本")
                click("beauty-compose", "video")
                expect(page.locator('[name="beauty-instruction"]')).to_contain_text("无已选首帧")
                click("beauty-generate")
                page.wait_for_function("() => !document.querySelector('#modal').open || !document.querySelector('#modal-error').textContent.startsWith('正在生成')")
                assert not page.locator("#modal").is_visible(), page.locator("#modal-error").text_content()
                expect(page.locator("#modal")).not_to_be_visible()
                expect(page.locator('[name="video_prompt"]')).to_contain_text("轻轻抬眼")
                click("beauty-current")
                expect(page.locator("#toast")).to_have_text("已保存并设为当前版本")
                page.locator("#inbox-input").set_input_files(clips[:1])
                expect(page.locator("[data-map-shot]")).to_have_count(1)
                click("inbox-commit")
                expect(page.locator(".candidate")).to_have_count(1)
                page.keyboard.press("a")
                expect(page.locator(".candidate")).to_have_count(0)
                assert production_status(state(), work=next(e["id"] for e in state()["entities"] if e["kind"] == "shot"))["ready"]
                click("flow-next")
                expect(page.locator(".notice")).to_contain_text("检查通过")
                with page.expect_download() as download:
                    click("delivery-download")
                download.value.save_as(Path(temp)/"beauty-delivery.zip")
                page.set_viewport_size({"width": 390, "height": 844})
                no_overflow()
                page.screenshot(path="/tmp/prompt-studio-beauty-mobile.png", full_page=True)
                page.set_viewport_size({"width": 1440, "height": 1000})
                page.screenshot(path="/tmp/prompt-studio-beauty-desktop.png", full_page=True)
                print("PASS four-step beauty workflow, shared person copy, AI prompt preview, video without first frame", flush=True)
                with page.expect_download() as download:
                    click("backup")
                backup = Path(temp)/"backup.zip"
                download.value.save_as(backup)
                click("delete-project")
                page.locator('[name="confirmation"]').fill("今日视频验收")
                click("confirm-delete-project")
                expect(page.locator("#project-select")).to_contain_text("尚未创建项目")
                click("workspace-trash")
                expect(page.locator("#modal")).to_contain_text("今日视频验收")
                click("trash-restore")
                expect(page.locator("#project-select option:checked")).to_have_text("今日视频验收")
                assert len(selected_takes(state())) == 1
                click("settings")
                click("settings-test", "vision")
                expect(page.locator("#modal-error")).to_contain_text("图片请求通过", timeout=25000)
                click("close")
                page.locator("#restore-input").set_input_files(str(backup))
                expect(page.locator("#project-select option:checked")).to_contain_text("恢复")
                assert len(selected_takes(state())) == 1
                page.reload()
                page.wait_for_load_state("networkidle")
                for space in ("drama", "beauty"):
                    assert page.request.get(f"http://127.0.0.1:{server.server_port}/guide/{space}").status == 200
                assert not errors, errors
                browser.close()
                print("PASS recoverable project deletion, backup restoration, connection tests, responsive layout; no JS errors", flush=True)
        except Exception:
            print("Browser runtime errors:", errors, flush=True)
            raise
        finally:
            for service in (server, model):
                service.shutdown()
                service.server_close()


if __name__ == "__main__":
    main()
