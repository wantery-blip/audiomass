(function (w, d) {
	'use strict';

	var CDN = 'https://cdn.jsdelivr.net/npm/@ffmpeg/';
	var ffmpeg = null;
	var loading = null;

	function extension (name) {
		var part = (name || '').split ('.').pop ().toLowerCase ();
		return /^[a-z0-9]{1,8}$/.test (part) ? part : 'audio';
	}

	function safeName (name) {
		return (name || 'sound').replace (/\.[^.]+$/, '').replace (/[^a-z0-9_-]+/ig, '-').replace (/^-+|-+$/g, '') || 'sound';
	}

	function download (file) {
		var a = d.createElement ('a');
		a.href = URL.createObjectURL (file);
		a.download = file.name;
		d.body.appendChild (a);
		a.click ();
		setTimeout (function () { URL.revokeObjectURL (a.href); a.remove (); }, 1000);
	}

	function loadFFmpeg (status) {
		if (ffmpeg) return Promise.resolve (ffmpeg);
		if (loading) return loading;
		status ('正在下載進階轉檔引擎（首次使用時需要較久）…');
		loading = Promise.all ([
			import (CDN + 'ffmpeg@0.12.10/dist/esm/index.js'),
			import (CDN + 'util@0.12.1/dist/esm/index.js')
		]).then (function (modules) {
			var FFmpeg = modules[0].FFmpeg;
			var toBlobURL = modules[1].toBlobURL;
			ffmpeg = new FFmpeg ();
			ffmpeg.on ('progress', function (p) {
				status ('正在轉檔：' + Math.max (0, Math.min (100, Math.round ((p.progress || 0) * 100))) + '%');
			});
			return Promise.all ([
				toBlobURL (CDN + 'core@0.12.6/dist/esm/ffmpeg-core.js', 'text/javascript'),
				toBlobURL (CDN + 'core@0.12.6/dist/esm/ffmpeg-core.wasm', 'application/wasm')
			]).then (function (urls) {
				return ffmpeg.load ({ coreURL: urls[0], wasmURL: urls[1] });
			}).then (function () { return ffmpeg; });
		}).catch (function (err) {
			ffmpeg = null;
			loading = null;
			throw err;
		});
		return loading;
	}

	function settingsFor (format) {
		if (format === 'mp3') return ['-c:a', 'libmp3lame', '-q:a', '2'];
		if (format === 'aac') return ['-c:a', 'aac', '-b:a', '192k'];
		if (format === 'ogg') return ['-c:a', 'libvorbis', '-q:a', '5'];
		return ['-c:a', 'pcm_s16le'];
	}

	function mimeFor (format) {
		return { mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', ogg: 'audio/ogg' }[format] || 'application/octet-stream';
	}

	w.SoundEditorFFmpeg = {
		open: function (app) {
			new PKSimpleModal ({
				title: '進階轉檔（ffmpeg.wasm）',
				clss: 'pk_modal_anim',
				buttons: [{
					title: '開始轉檔',
					clss: 'pk_modal_a_accpt',
					callback: function (modal) {
						var input = modal.el_body.querySelector ('input[type=file]');
						var format = modal.el_body.querySelector ('select').value;
						var openResult = modal.el_body.querySelector ('input[type=checkbox]').checked;
						var statusEl = modal.el_body.querySelector ('.ffmpeg-status');
						var status = function (message) { statusEl.textContent = message; };
						var source = input.files && input.files[0];
						if (!source) { status ('請先選擇一個影音檔。'); return; }
						input.disabled = true;
						status ('準備轉檔…');
						loadFFmpeg (status).then (function (engine) {
							var inputName = 'input.' + extension (source.name);
							var outputName = safeName (source.name) + '.' + format;
							return engine.writeFile (inputName, new Uint8Array ()).then (function () {
								return source.arrayBuffer ();
							}).then (function (buffer) {
								return engine.writeFile (inputName, new Uint8Array (buffer));
							}).then (function () {
								return engine.exec (['-i', inputName, '-vn'].concat (settingsFor (format), [outputName]));
							}).then (function () {
								return engine.readFile (outputName).then (function (data) {
									return { inputName: inputName, outputName: outputName, data: data };
								});
							});
						}).then (function (result) {
							var file = new File ([result.data.buffer], result.outputName, { type: mimeFor (format) });
							download (file);
							if (openResult) app.engine.LoadFile ({ files: [file] });
							status ('完成：已下載 ' + result.outputName + (openResult ? '，並已開啟至編輯器。' : '。'));
							return Promise.all ([ffmpeg.deleteFile (result.inputName), ffmpeg.deleteFile (result.outputName)]);
						}).catch (function (err) {
							status ('轉檔失敗：' + (err && err.message ? err.message : '請確認檔案格式與瀏覽器網路連線。'));
							input.disabled = false;
						});
					}
				}],
				body: '<p>檔案只會在此瀏覽器中處理；首次使用才會下載 ffmpeg.wasm 引擎。</p>' +
					'<div class="pk_row"><label>來源檔案</label><input class="pk_txt" type="file" accept="audio/*,video/*"></div>' +
					'<div class="pk_row"><label>輸出格式</label><select class="pk_txt"><option value="mp3">MP3</option><option value="wav">WAV</option><option value="aac">AAC</option><option value="ogg">OGG</option></select></div>' +
					'<div class="pk_row"><input class="pk_check" type="checkbox" id="ffmpeg-open-result" checked><label for="ffmpeg-open-result">完成後開啟到編輯器</label></div>' +
					'<p class="ffmpeg-status" aria-live="polite"></p><p><small>ffmpeg.wasm 採按需載入；本工具使用其 MIT 授權的 JavaScript 封裝，轉檔核心及其編解碼器依其個別授權提供。</small></p>'
			}).Show ();
		}
	};
})(window, document);
