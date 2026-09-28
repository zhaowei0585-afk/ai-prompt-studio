#!/usr/bin/env python3
"""Optional browser integration: pip install playwright; use installed Chrome or PW_CHANNEL."""
import base64
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer

from playwright.sync_api import sync_playwright, expect

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from studio import Studio, Handler
from smoke import Model


def main():
    with tempfile.TemporaryDirectory() as temp:
        app=Studio(Path(temp)/"data",Path(temp)/"settings.json")
        server=ThreadingHTTPServer(("127.0.0.1",0),Handler)
        server.app=app
        model=ThreadingHTTPServer(("127.0.0.1",0),Model)
        for service in (server,model):
            threading.Thread(target=service.serve_forever,daemon=True).start()
        app.save_settings({"base_url":f"http://127.0.0.1:{model.server_port}/v1","model":"mock","vision_model":"mock-vision"})
        image=Path(temp)/"test-reference.png"
        image.write_bytes(base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII="))
        errors=[]
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(headless=True,channel=os.environ.get("PW_CHANNEL","chrome"))
                page=browser.new_page(viewport={"width":1440,"height":1000},permissions=["clipboard-read","clipboard-write"])
                page.set_default_timeout(8000)
                page.on("pageerror",lambda error: errors.append(str(error)))
                page.on("dialog",lambda dialog: dialog.accept())

                def click(action, key=None):
                    selector=f'[data-action="{action}"]'
                    if key is not None:
                        selector+=f'[data-id="{key}"]'
                    try:
                        page.locator(selector+":visible").last.click()
                    except Exception:
                        print({"failed_action":action,"page":page.url,"toast":page.locator("#toast").text_content(),
                               "media":page.locator(".media-card").all_text_contents(),"errors":errors},flush=True)
                        page.screenshot(path="/tmp/prompt-studio-browser-failure.png",full_page=True)
                        raise

                def nav(name, title=None):
                    page.locator(f'#nav [data-page="{name}"]').click()
                    expect(page.locator("#page-title")).to_have_text(title or {
                        "sources":"素材与定位","stages":"剧本与分镜","profiles":"可选工作流档案",
                        "shots":"批量出图","attempts":"图生视频","recipes":"成片复盘",
                        "overview":"漫剧生产台","templates":"流程模板","assets":"角色一致性"}[name])

                def save_form():
                    page.locator('#record-form button[type="submit"]').click()
                    expect(page.locator("#modal")).not_to_be_visible()

                def assert_no_overflow():
                    layout=page.evaluate("""() => ({page:document.documentElement.scrollWidth,viewport:innerWidth,
                        elements:[...document.querySelectorAll('body *')].map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,cls:String(e.className),text:(e.textContent||'').trim().slice(0,30),left:r.left,right:r.right}}).filter(x=>x.left < -1 || x.right > innerWidth + 1).slice(0,20)})""")
                    assert layout["page"] <= layout["viewport"], layout

                page.goto(f"http://127.0.0.1:{server.server_port}")
                page.wait_for_load_state("networkidle")
                expect(page.get_by_role("button",name="打开原创示例",exact=True)).to_be_visible()
                click("demo")
                expect(page.locator(".hero h2")).to_have_text("雨夜失物 · 原创示例")
                assert page.locator(".stat strong").all_text_contents()==["3","0","—","—"]
                expect(page.locator(".pipeline .phase")).to_have_count(5)
                assert page.locator(".pipeline h3").all_text_contents()==["剧本分镜","角色一致性","批量出图","图生视频","成片复盘"]
                print("PASS browser startup and original three-shot project",flush=True)

                nav("sources")
                click("edit-source","")
                page.locator('[name="title"]').fill("补充来源 <b>只显示文字</b>")
                page.locator('[name="locator"]').fill("原创 P4")
                page.locator('[name="text"]').fill("P4：林岚仍用右手握着钥匙，没有更换衣服。")
                page.locator('[name="reviewed"]').check()
                save_form()
                added_source=page.locator(".card").filter(has_text="补充来源 <b>只显示文字</b>")
                expect(added_source.locator("h3")).to_have_text("补充来源 <b>只显示文字</b>")
                added_source.locator('[data-action="edit-source"]').click()
                page.locator('[name="text"]').fill("P4 修订：林岚仍用右手握着钥匙。")
                save_form()
                page.locator(".card").filter(has_text="补充来源").locator('[data-action="edit-source"]').click()
                page.locator(".history summary").click()
                expect(page.locator('[data-action="delete-version"]')).to_have_count(1)
                page.locator('[data-action="delete-version"]').click()
                expect(page.locator("#modal")).not_to_be_visible()
                page.locator("#upload-input").set_input_files(str(image))
                expect(page.locator(".media-card")).to_have_count(1)
                # Create a disposable half-second video fixture; it is never shipped as product media.
                clip=Path(temp)/"test-motion.webm"
                clip.write_bytes(bytes(page.evaluate("""async () => {
                    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
                    const ctx=canvas.getContext('2d'), stream=canvas.captureStream(10);
                    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
                    const chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);
                    const stopped=new Promise(resolve=>recorder.onstop=resolve);
                    recorder.start();let frame=0;
                    const timer=setInterval(()=>{ctx.fillStyle=++frame%2?'#226f55':'#dcedb7';ctx.fillRect(0,0,64,64);},50);
                    setTimeout(()=>{clearInterval(timer);recorder.stop();stream.getTracks().forEach(t=>t.stop());},600);
                    await stopped;return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
                }""")))
                page.locator("#upload-input").set_input_files(str(clip))
                expect(page.locator(".media-card")).to_have_count(2)
                click("capture")
                expect(page.locator("#capture-video")).to_have_js_property("readyState",4)
                click("capture-frame")
                expect(page.locator('[name="locator"]')).to_have_value("test-motion.webm / 0.000 秒")
                assert "连续动作" in page.locator('[name="text"]').input_value()
                save_form()
                expect(page.locator(".media-card")).to_have_count(3)
                print("PASS source form, escaped text, upload and actual video-frame extraction",flush=True)

                nav("profiles")
                click("edit-profile","")
                page.locator('[name="title"]').fill("测试 I2V 档案")
                page.locator('[name="mode"]').select_option("i2v")
                assert "first_frame" in page.locator('[name="slots"]').input_value()
                page.locator('[name="negative_prompt"]').select_option("false")
                page.locator('[name="verified"]').check()
                save_form()

                nav("stages")
                click("stage","M01")
                page.locator("label.check").filter(has_text="补充来源").locator("input").check()
                click("compose")
                assert "原创 P4" in page.locator('[name="composed"]').input_value()
                click("generate")
                expect(page.locator("#modal")).not_to_be_visible()
                expect(page.locator("#stage-output")).to_contain_text("模型草稿")
                generated={"text":"本集单镜测试草稿，来自原创 P4。","shots":[{
                    "key":"CHECK-001","title":"检查镜头","duration":5,"source":"原创 P4",
                    "start":"右手握钥匙","action":"抬眼","end":"看向画左","camera":"固定中景",
                    "image_prompt":"成年人物右手握钥匙，目光朝下","video_prompt":"保持右手持物，抬眼看向画左。",
                    "edit_notes":"声音后期处理","bindings":{}}],"assets":[]}
                page.locator("#stage-output").fill(json.dumps(generated,ensure_ascii=False))
                click("save-accept-stage")
                expect(page.locator("#toast")).to_contain_text("已保存并采用")
                click("import-structured")
                expect(page.locator("#toast")).to_contain_text("已同步并采用 1")
                print("PASS prompt preview, model draft, stage acceptance and structured-shot import",flush=True)

                nav("shots")
                expect(page.locator(".shot-card")).to_have_count(4)
                click("edit-shot","CHECK-001")
                page.locator("summary").filter(has_text="可选：ComfyUI 工作流").click()
                page.locator('[name="profile"]').select_option(label="测试 I2V 档案 · v1")
                page.locator('[name="binding:first_frame"]').select_option(label="test-reference.png")
                expect(page.locator("#negative-field")).not_to_be_visible()
                save_form()
                click("edit-shot","CHECK-001")
                click("accept-record","CHECK-001")
                expect(page.locator("#modal")).not_to_be_visible()
                card=page.locator(".shot-card").filter(has_text="检查镜头")
                expect(card.locator(".badge").first).to_have_text("可投产")
                nav("attempts")
                click("new-attempt","CHECK-001")
                page.locator('[name="title"]').fill("第一次试片 · 已检查截图")
                page.locator('[name="actual_prompt"]').fill("实际只改了抬眼幅度。")
                page.locator('[name="feedback"]').fill("00:02 持物正确；这是浏览器流程测试，不是真实出片质量证明。")
                result=Path(temp)/"test-result.png"
                result.write_bytes(image.read_bytes())
                existing_results=page.locator('[name="result_media"]').count()
                page.locator("#upload-input").set_input_files(str(result))
                expect(page.locator('[name="result_media"]')).to_have_count(existing_results+1)
                assert page.locator('[name="actual_prompt"]').input_value()=="实际只改了抬眼幅度。"
                page.locator('[name="judgment"]').select_option("accepted")
                page.locator('[name="user_reviewed"]').check()
                save_form()
                click("select-take")
                expect(page.locator(".card .badge.ok").last).to_have_text("已采用 v1")
                click("repair")
                expect(page.locator("#page-title")).to_have_text("剧本与分镜")
                assert "第一次试片" in page.locator("#context-form").inner_text()
                assert "实际只改了抬眼幅度" in page.locator('[name="extra"]').input_value()
                print("PASS workflow binding, readiness, result upload, actual-input retention, take selection and repair",flush=True)

                nav("recipes")
                click("edit-publication","")
                page.locator('[name="title"]').fill("测试作品")
                page.locator('[name="window"]').fill("发布后 24 小时")
                page.locator('[name="views"]').fill("0")
                save_form()
                expect(page.locator("tbody tr")).to_contain_text("测试作品")
                expect(page.locator("tbody tr")).to_contain_text("发布后 24 小时")
                nav("templates")
                page.locator('[name="template-body"]').fill("仅用于浏览器测试的项目模板。")
                click("save-template")
                expect(page.locator("#toast")).to_contain_text("模板新版本已保存")

                nav("overview")
                assert page.locator(".stat strong").nth(1).inner_text()=="1"
                with page.expect_download() as download:
                    click("backup")
                backup=Path(temp)/"project.zip"
                download.value.save_as(str(backup))
                page.locator("#restore-input").set_input_files(str(backup))
                expect(page.locator(".hero h2")).to_contain_text("恢复")
                assert page.locator(".stat strong").nth(1).inner_text()=="1"
                page.reload()
                page.wait_for_load_state("networkidle")
                expect(page.locator(".hero h2")).to_contain_text("恢复")
                print("PASS publication links, template save, browser download/restore and reload persistence",flush=True)

                page.screenshot(path="/tmp/prompt-studio-desktop.png",full_page=True)
                page.set_viewport_size({"width":390,"height":844})
                assert_no_overflow()
                nav("shots")
                assert_no_overflow()
                page.screenshot(path="/tmp/prompt-studio-mobile.png",full_page=True)
                original_project=page.locator("#project-select").input_value()
                click("switch-space","beauty")
                expect(page.locator("#tab-beauty")).to_have_attribute("aria-selected","true")
                assert original_project not in page.locator("#project-select option").evaluate_all("(items)=>items.map(i=>i.value)")
                click("new-project")
                page.locator('#project-form [name="name"]').fill("美女创作测试")
                page.locator('#project-form button[type="submit"]').click()
                expect(page.locator("#beauty-form")).to_be_visible()
                beauty_project=page.locator("#project-select").input_value()
                expect(page.locator("#nav button")).to_have_count(3)
                expect(page.locator("#episode")).not_to_be_visible()
                nav("beauty-characters","人物库")
                click("edit-asset","")
                page.locator('[name="title"]').fill("林夏 <b>成年原创人物</b>")
                page.locator('[name="description"]').fill("成年女性，黑色齐肩发，自然神态。")
                page.locator("#upload-input").set_input_files(str(image))
                expect(page.locator('[name="media_ids"]')).to_be_checked()
                save_form()
                click("beauty-use-character")
                expect(page.locator("#beauty-form")).to_be_visible()
                page.locator('#beauty-form [name="title"]').fill("咖啡店日常")
                page.locator('#beauty-form [name="idea"]').fill("咖啡店窗边，白色毛衣，自然回眸")
                page.locator('#beauty-form [name="platform"]').fill("公开 AI 平台 / 手工生成")
                for mode in ("outfit","dance","daily"):
                    page.locator('#beauty-form [name="mode"]').select_option(mode)
                    expect(page.locator('#beauty-form [name="idea"]')).to_have_value("咖啡店窗边，白色毛衣，自然回眸")
                click("beauty-basic")
                expect(page.locator('[name="image_prompt"]')).to_contain_text("白色毛衣")
                click("beauty-copy","image")
                expect(page.locator("#toast")).to_have_text("已复制")
                assert "白色毛衣" in page.evaluate("navigator.clipboard.readText()")
                click("beauty-compose","image")
                expect(page.locator('[name="beauty-instruction"]')).to_contain_text("B04")
                page.locator("#modal summary").click()
                page.locator('[name="beauty-external"]').fill('{"image_prompt":"外部平台整理的图片词：白色毛衣，窗边自然光。"}')
                click("beauty-load-external")
                expect(page.locator('[name="image_prompt"]')).to_contain_text("外部平台整理")
                page.locator('[name="vision"]').check()
                click("beauty-compose","image")
                expect(page.locator("#modal .notice")).to_contain_text("1 张图片")
                click("beauty-generate")
                expect(page.locator("#modal")).not_to_be_visible()
                expect(page.locator('[name="image_prompt"]')).to_contain_text("白色圆领毛衣")
                print("PASS separate tabs, character reuse, three modes, offline prompts, external paste and AI prompt generation",flush=True)

                click("beauty-result","image")
                page.locator('[name="actual_prompt"]').fill("实际在平台用了白色圆领毛衣，窗边自然光。")
                with page.expect_file_chooser() as chooser:
                    click("beauty-upload","result")
                chooser.value.set_files(str(result))
                expect(page.locator('[name="beauty_result_media"]')).not_to_have_value("")
                expect(page.locator('[name="actual_prompt"]')).to_have_value("实际在平台用了白色圆领毛衣，窗边自然光。")
                page.locator('[name="judgment"]').select_option("accepted")
                page.locator('[name="user_reviewed"]').check()
                click("beauty-save-result")
                expect(page.locator("#modal")).not_to_be_visible()
                click("beauty-select")
                expect(page.locator(".beauty-progress")).to_contain_text("已采用图片")
                state=app.store.snapshot(beauty_project)
                from studio import selected_takes
                selected_image=selected_takes(state,"image")
                assert len(selected_image)==1 and not selected_takes(state)
                work_id=next(iter(selected_image))
                image_id=selected_image[work_id]["id"]
                click("beauty-character-from",image_id)
                page.locator('#beauty-character-form [name="title"]').fill("从满意结果保存的人物")
                click("beauty-save-character",image_id)
                expect(page.locator("#modal")).not_to_be_visible()
                assert len([e for e in app.store.snapshot(beauty_project)["entities"] if e["kind"]=="asset"])==2
                click("beauty-edit-result",image_id)
                page.locator('[name="feedback"]').fill("下轮只减少背景物品，保持人物和白色圆领毛衣。")
                click("beauty-save-result")
                expect(page.locator("#modal")).not_to_be_visible()
                assert selected_takes(app.store.snapshot(beauty_project),"image")==selected_image
                page.locator("summary").filter(has_text="让选定图片动起来").click()
                click("beauty-compose","video")
                expect(page.locator('[name="beauty-instruction"]')).to_contain_text("实际采用图片记录")
                click("beauty-generate")
                expect(page.locator("#modal")).not_to_be_visible()
                expect(page.locator('[name="video_prompt"]')).to_contain_text("轻轻抬眼")
                click("beauty-copy","video")
                expect(page.locator("#toast")).to_have_text("已复制")
                click("beauty-result","video")
                with page.expect_file_chooser() as chooser:
                    click("beauty-upload","result")
                chooser.value.set_files(str(clip))
                expect(page.locator('[name="beauty_result_media"]')).not_to_have_value("")
                page.locator('[name="judgment"]').select_option("accepted")
                page.locator('[name="user_reviewed"]').check()
                click("beauty-save-result")
                expect(page.locator("#modal")).not_to_be_visible()
                video_id=next(e["id"] for e in app.store.snapshot(beauty_project)["entities"]
                              if e["kind"]=="attempt" and e["versions"][-1]["content"].get("medium")=="video")
                click("beauty-select",video_id)
                expect(page.locator(".beauty-progress")).to_contain_text("已采用视频")
                state=app.store.snapshot(beauty_project)
                assert selected_takes(state,"image")==selected_image and selected_takes(state)[work_id]["id"]==video_id
                work=next(e for e in state["entities"] if e["id"]==work_id)
                assert work["versions"][-1]["content"]["video_source"]==selected_image[work_id]
                assert_no_overflow()
                page.screenshot(path="/tmp/prompt-studio-beauty-mobile.png",full_page=True)
                page.set_viewport_size({"width":1440,"height":1000})
                page.get_by_role("tab",name="AI 美女",exact=True).scroll_into_view_if_needed()
                page.screenshot(path="/tmp/prompt-studio-beauty-desktop.png",full_page=True)
                click("beauty-repair",image_id)
                expect(page.locator('[name="repair_note"]')).to_contain_text("只减少背景物品")
                click("beauty-compose","image")
                expect(page.locator('[name="beauty-instruction"]')).to_contain_text("返修按用户描述")
                click("beauty-generate")
                expect(page.locator("#modal")).not_to_be_visible()
                page.locator('[name="image_prompt"]').fill("修改图片：保持白色圆领毛衣，减少背景物品。")
                expect(page.locator('[name="video_prompt"]')).to_have_value("")
                click("beauty-save")
                expect(page.locator("#toast")).to_contain_text("作品已保存")
                nav("beauty-library","作品与收藏")
                click("beauty-favorite",work_id)
                expect(page.locator("#toast")).to_contain_text("已收藏")
                click("beauty-use-recipe")
                expect(page.locator('[name="image_prompt"]')).to_contain_text("减少背景物品")
                expect(page.locator('[name="video_prompt"]')).to_have_value("")
                nav("beauty-library","作品与收藏")
                click("beauty-open",work_id)
                page.reload()
                page.wait_for_load_state("networkidle")
                expect(page.locator("#tab-beauty")).to_have_attribute("aria-selected","true")
                nav("beauty-library","作品与收藏")
                click("beauty-open",work_id)
                expect(page.locator('[name="image_prompt"]')).to_contain_text("减少背景物品")
                with page.expect_download() as download:
                    click("backup")
                beauty_backup=Path(temp)/"beauty.zip"
                download.value.save_as(str(beauty_backup))
                page.locator("#restore-input").set_input_files(str(beauty_backup))
                expect(page.locator("#project-select option:checked")).to_contain_text("恢复")
                nav("beauty-library","作品与收藏")
                expect(page.locator('[data-action="beauty-open"]')).to_have_count(1)
                print("PASS image-only completion, actual inputs, image/video selection, history, templates and backup",flush=True)

                # Legacy projects remain intact and route into the same simplified UI.
                for track in ("daily","outfit","dance"):
                    app.store.create({"name":"旧项目 "+track,"track":track})
                page.reload()
                page.wait_for_load_state("networkidle")
                for track in ("daily","outfit","dance"):
                    page.locator("#project-select").select_option(label="旧项目 "+track)
                    expect(page.locator('#beauty-form [name="mode"]')).to_have_value(track)
                    expect(page.locator("#nav button")).to_have_count(3)
                project_count=page.locator("#project-select option").count()
                click("delete-project")
                page.locator('#delete-project-form [name="confirmation"]').fill("旧项目 dance")
                click("confirm-delete-project")
                expect(page.locator("#project-select option")).to_have_count(project_count-1)
                click("switch-space","drama")
                page.locator("#project-select").select_option(original_project)
                nav("stages")
                expect(page.locator(".steps .active")).to_contain_text("M01")
                for space in ("drama","beauty"):
                    response=page.request.get(f"http://127.0.0.1:{server.server_port}/guide/{space}")
                    assert response.status==200 and "使用说明" in response.text()
                print("PASS legacy project routing, delete controls, tab isolation and both manuals",flush=True)
                assert not errors, errors
                browser.close()
                print("PASS desktop/mobile layout and no JavaScript runtime errors\nAll browser checks passed.",flush=True)
        finally:
            for service in (server,model):
                service.shutdown()
                service.server_close()


if __name__=="__main__":
    main()
