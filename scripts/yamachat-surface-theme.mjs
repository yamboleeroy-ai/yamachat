const early=String.raw`
<script id="ycSurfaceThemeEarly">(()=>{try{const v=localStorage.getItem('yc_surface_theme_v1');document.documentElement.dataset.ycSurfaceTheme=v==='white'?'white':'dark'}catch{document.documentElement.dataset.ycSurfaceTheme='dark'}})();</script>
`;

const style=String.raw`
<style id="ycSurfaceThemeStyle">
:root,html[data-yc-surface-theme="dark"]{
 color-scheme:dark;--yc-surface-page:#070b14;--yc-surface-page2:#141126;--yc-surface-panel:rgba(13,18,34,.94);--yc-surface-strong:#0e1427;--yc-surface-soft:#171b32;--yc-surface-hover:#202540;--yc-surface-input:#0a1020;--yc-surface-line:rgba(150,160,210,.18);--yc-surface-line2:rgba(173,183,232,.30);--yc-surface-text:#f1f3ff;--yc-surface-muted:#98a0bd;--yc-surface-faint:#68718f;--yc-surface-shadow:rgba(0,0,0,.56);--yc-surface-backdrop:rgba(3,5,12,.74);--yc-surface-haze:color-mix(in srgb,var(--yc-theme,#a77cff) 15%,transparent);--yc-themed-scroll-track:#080d18
}
html[data-yc-surface-theme="white"]{
 color-scheme:light;--yc-surface-page:#eef1f8;--yc-surface-page2:#fafbfe;--yc-surface-panel:rgba(255,255,255,.93);--yc-surface-strong:#fff;--yc-surface-soft:#f2f4fa;--yc-surface-hover:#e9edf7;--yc-surface-input:#f7f8fc;--yc-surface-line:rgba(63,70,104,.14);--yc-surface-line2:rgba(65,73,111,.25);--yc-surface-text:#20253a;--yc-surface-muted:#68708b;--yc-surface-faint:#9097aa;--yc-surface-shadow:rgba(42,48,78,.18);--yc-surface-backdrop:rgba(45,51,75,.32);--yc-surface-haze:color-mix(in srgb,var(--yc-theme,#8d67e8) 11%,transparent);--yc-themed-scroll-track:#e7eaf2
}
html[data-yc-surface-theme] body{color:var(--yc-surface-text)!important;background:radial-gradient(900px 560px at 72% -12%,var(--yc-surface-haze),transparent 66%),radial-gradient(780px 520px at 5% 110%,rgba(88,104,255,.08),transparent 68%),linear-gradient(145deg,var(--yc-surface-page),var(--yc-surface-page2))!important}
html[data-yc-surface-theme] body .app,html[data-yc-surface-theme] body .app.yc-v3-ready{background:transparent!important}
html[data-yc-surface-theme] body #ycGlobalNav,html[data-yc-surface-theme] body .yc-v3-global-nav,html[data-yc-surface-theme] body .yc-v3-workspace>.top,html[data-yc-surface-theme] body .top,html[data-yc-surface-theme] body .yc-v3-ribbon{background:linear-gradient(180deg,color-mix(in srgb,var(--yc-surface-strong) 95%,var(--yc-theme,#a77cff) 5%),var(--yc-surface-panel))!important;border-color:var(--yc-surface-line)!important;color:var(--yc-surface-text)!important;box-shadow:0 14px 42px var(--yc-surface-shadow),inset 0 1px 0 rgba(255,255,255,.035)!important}
html[data-yc-surface-theme] body .yc-v3-content-grid>.side,html[data-yc-surface-theme] body .yc-v3-content-grid>.chat,html[data-yc-surface-theme] body .yc-v3-content-grid>.right,html[data-yc-surface-theme] body .side,html[data-yc-surface-theme] body .chat,html[data-yc-surface-theme] body .right{background:radial-gradient(circle at 50% -18%,var(--yc-surface-haze),transparent 38%),linear-gradient(180deg,var(--yc-surface-panel),var(--yc-surface-strong))!important;border-color:var(--yc-surface-line)!important;color:var(--yc-surface-text)!important;box-shadow:0 18px 48px var(--yc-surface-shadow),inset 0 1px 0 rgba(255,255,255,.03)!important}
html[data-yc-surface-theme] body .side-head,html[data-yc-surface-theme] body .chat-head,html[data-yc-surface-theme] body .right-tabs,html[data-yc-surface-theme] body .steam-social-head,html[data-yc-surface-theme] body .yc-friends-home-head,html[data-yc-surface-theme] body .yc-notify-head{background:linear-gradient(180deg,var(--yc-surface-soft),var(--yc-surface-panel))!important;border-color:var(--yc-surface-line)!important;color:var(--yc-surface-text)!important}
html[data-yc-surface-theme] body .messages,html[data-yc-surface-theme] body .right-content,html[data-yc-surface-theme] body .channels,html[data-yc-surface-theme] body .yc-friends-home,html[data-yc-surface-theme] body .yc-friends-home-body{background:transparent!important;color:var(--yc-surface-text)!important}
html[data-yc-surface-theme] body .composer-wrap{background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--yc-surface-page) 58%,transparent))!important}
html[data-yc-surface-theme] body .composer{background:linear-gradient(180deg,var(--yc-surface-soft),var(--yc-surface-input))!important;border-color:color-mix(in srgb,var(--yc-theme,#a77cff) 52%,var(--yc-surface-line2))!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 8px 26px var(--yc-surface-shadow)!important}
html[data-yc-surface-theme] body .composer:focus-within,html[data-yc-surface-theme] body.yc-wotlk-theme .composer:focus-within{border-color:color-mix(in srgb,var(--yc-theme,#a77cff) 88%,var(--yc-surface-text))!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--yc-theme,#a77cff) 18%,transparent),0 0 18px color-mix(in srgb,var(--yc-theme,#a77cff) 30%,transparent),inset 0 1px 0 rgba(255,255,255,.04)!important}
html[data-yc-surface-theme] body input,html[data-yc-surface-theme] body textarea,html[data-yc-surface-theme] body select{background:var(--yc-surface-input)!important;border-color:var(--yc-surface-line2)!important;color:var(--yc-surface-text)!important}
html[data-yc-surface-theme] body input::placeholder,html[data-yc-surface-theme] body textarea::placeholder{color:var(--yc-surface-faint)!important}
html[data-yc-surface-theme] body input:focus,html[data-yc-surface-theme] body textarea:focus,html[data-yc-surface-theme] body select:focus{border-color:color-mix(in srgb,var(--yc-theme,#a77cff) 70%,var(--yc-surface-line2))!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--yc-theme,#a77cff) 12%,transparent)!important}
html[data-yc-surface-theme] body .modal-back,html[data-yc-surface-theme] body .yc-theme-backdrop,html[data-yc-surface-theme] body .yc-ss-back{background:var(--yc-surface-backdrop)!important;backdrop-filter:blur(12px)!important}
html[data-yc-surface-theme] body .modal,html[data-yc-surface-theme] body .yc-theme-modal,html[data-yc-surface-theme] body .yc-app-settings-modal,html[data-yc-surface-theme] body .yc-ss-shell,html[data-yc-surface-theme] body .yc-notify-panel,html[data-yc-surface-theme] body .yc-ui-menu,html[data-yc-surface-theme] body .yc-channel-menu,html[data-yc-surface-theme] body .yc-context-menu,html[data-yc-surface-theme] body [role="menu"],html[data-yc-surface-theme] body .yc-user-hover-card{background:radial-gradient(circle at 18% -8%,var(--yc-surface-haze),transparent 36%),linear-gradient(155deg,var(--yc-surface-strong),var(--yc-surface-panel))!important;border-color:color-mix(in srgb,var(--yc-theme,#a77cff) 28%,var(--yc-surface-line2))!important;color:var(--yc-surface-text)!important;box-shadow:0 26px 76px var(--yc-surface-shadow),0 0 28px color-mix(in srgb,var(--yc-theme,#a77cff) 9%,transparent)!important}
html[data-yc-surface-theme] body .yc-app-settings-section,html[data-yc-surface-theme] body .yc-update-card,html[data-yc-surface-theme] body .yc-ss-card,html[data-yc-surface-theme] body .yc-role-list,html[data-yc-surface-theme] body .yc-role-editor,html[data-yc-surface-theme] body .yc-setting-choice,html[data-yc-surface-theme] body .yc-perm,html[data-yc-surface-theme] body .yc-ss-toggle,html[data-yc-surface-theme] body .yc-role-assign-menu,html[data-yc-surface-theme] body .yc-soundboard-volume{background:linear-gradient(180deg,var(--yc-surface-soft),var(--yc-surface-panel))!important;border-color:var(--yc-surface-line)!important;color:var(--yc-surface-text)!important}
html[data-yc-surface-theme] body .yc-ss-nav,html[data-yc-surface-theme] body .yc-ss-main,html[data-yc-surface-theme] body .yc-ss-head{background:var(--yc-surface-panel)!important;border-color:var(--yc-surface-line)!important}
html[data-yc-surface-theme] body .yc-ss-tab{color:var(--yc-surface-muted)!important}
html[data-yc-surface-theme] body .yc-ss-tab.active{color:var(--yc-surface-text)!important;background:color-mix(in srgb,var(--yc-surface-hover) 82%,var(--yc-theme,#a77cff) 18%)!important;border-color:color-mix(in srgb,var(--yc-theme,#a77cff) 45%,var(--yc-surface-line2))!important;box-shadow:inset 3px 0 0 var(--yc-theme,#a77cff),0 0 16px color-mix(in srgb,var(--yc-theme,#a77cff) 12%,transparent)!important}
html[data-yc-surface-theme] body #voiceControls,html[data-yc-surface-theme] body .voice-controls,html[data-yc-surface-theme] body .yc-v3-voice-host #voiceControls.voice-controls{background:radial-gradient(circle at 10% 0,var(--yc-surface-haze),transparent 42%),linear-gradient(180deg,var(--yc-surface-soft),var(--yc-surface-strong))!important;border-color:color-mix(in srgb,var(--yc-theme,#a77cff) 55%,var(--yc-surface-line2))!important;color:var(--yc-surface-text)!important}
html[data-yc-surface-theme] body .voice-user-menu,html[data-yc-surface-theme] body #voiceUserContextMenu,html[data-yc-surface-theme] body #soundboardPanel{background:var(--yc-surface-strong)!important;border-color:var(--yc-surface-line)!important;color:var(--yc-surface-text)!important}
html[data-yc-surface-theme] body .server,html[data-yc-surface-theme] body .yc-v3-ribbon .server{color:var(--yc-surface-text)!important;background:linear-gradient(135deg,color-mix(in srgb,var(--yc-server-color,var(--yc-theme,#a77cff)) 12%,var(--yc-surface-soft)),var(--yc-surface-panel))!important;border-color:color-mix(in srgb,var(--yc-server-color,var(--yc-theme,#a77cff)) 30%,var(--yc-surface-line))!important}
html[data-yc-surface-theme] body .channel,html[data-yc-surface-theme] body .voice-channel,html[data-yc-surface-theme] body .dm,html[data-yc-surface-theme] body .person,html[data-yc-surface-theme] body .steam-member-row,html[data-yc-surface-theme] body .steam-friend-row{color:var(--yc-surface-text)!important}
html[data-yc-surface-theme] body .channel.active,html[data-yc-surface-theme] body .voice-channel.active,html[data-yc-surface-theme] body .dm.active{background:color-mix(in srgb,var(--yc-surface-hover) 80%,var(--yc-theme,#a77cff) 20%)!important;border-color:color-mix(in srgb,var(--yc-theme,#a77cff) 48%,var(--yc-surface-line2))!important}
html[data-yc-surface-theme] body .person:hover,html[data-yc-surface-theme] body .steam-member-row:hover,html[data-yc-surface-theme] body .steam-friend-row:hover,html[data-yc-surface-theme] body .dm:hover,html[data-yc-surface-theme] body .yc-setting-choice:hover{background:color-mix(in srgb,var(--yc-surface-hover) 88%,var(--yc-theme,#a77cff) 12%)!important}
html[data-yc-surface-theme] body button,html[data-yc-surface-theme] body .smallbtn,html[data-yc-surface-theme] body .ghost,html[data-yc-surface-theme] body .iconbtn,html[data-yc-surface-theme] body .yc-ss-btn{color:var(--yc-surface-text)!important}
html[data-yc-surface-theme] body button:not(.primary):not(.send):not(.danger),html[data-yc-surface-theme] body .smallbtn,html[data-yc-surface-theme] body .ghost,html[data-yc-surface-theme] body .iconbtn{background:linear-gradient(180deg,var(--yc-surface-soft),var(--yc-surface-panel))!important;border-color:var(--yc-surface-line2)!important}
html[data-yc-surface-theme] body .primary,html[data-yc-surface-theme] body .send,html[data-yc-surface-theme] body button.primary{background:linear-gradient(135deg,color-mix(in srgb,var(--yc-theme,#a77cff) 84%,#8195ff),color-mix(in srgb,var(--yc-theme,#a77cff) 52%,#5366e8))!important;border-color:color-mix(in srgb,var(--yc-theme,#a77cff) 74%,#aab3ff)!important;color:#fff!important;box-shadow:0 0 18px color-mix(in srgb,var(--yc-theme,#a77cff) 18%,transparent)!important}
html[data-yc-surface-theme] body .m-name,html[data-yc-surface-theme] body .steam-name,html[data-yc-surface-theme] body .person-info strong,html[data-yc-surface-theme] body .yc-hover-name,html[data-yc-surface-theme] body .yc-app-settings-section h4,html[data-yc-surface-theme] body .yc-ss-card h3,html[data-yc-surface-theme] body .yc-ss-head strong{color:var(--yc-surface-text)!important}
html[data-yc-surface-theme] body .m-time,html[data-yc-surface-theme] body .person-info small,html[data-yc-surface-theme] body .yc-hover-handle,html[data-yc-surface-theme] body .yc-app-settings-section>p,html[data-yc-surface-theme] body .yc-settings-note,html[data-yc-surface-theme] body .yc-ss-card p,html[data-yc-surface-theme] body .yc-ss-field label{color:var(--yc-surface-muted)!important}
html[data-yc-surface-theme] body .m-body{color:color-mix(in srgb,var(--yc-surface-text) 88%,var(--yc-surface-muted))!important}
html[data-yc-surface-theme] body .toast,html[data-yc-surface-theme] body .yc-update-notice{background:linear-gradient(180deg,var(--yc-surface-strong),var(--yc-surface-panel))!important;border-color:color-mix(in srgb,var(--yc-theme,#a77cff) 36%,var(--yc-surface-line2))!important;color:var(--yc-surface-text)!important;box-shadow:0 18px 48px var(--yc-surface-shadow)!important}
.yc-surface-theme-picker{display:grid;grid-template-columns:1fr 1fr;gap:10px}.yc-surface-choice{position:relative;display:grid;grid-template-columns:56px 1fr;gap:10px;align-items:center;padding:10px;border:1px solid var(--yc-surface-line2);border-radius:12px;background:var(--yc-surface-panel);cursor:pointer}.yc-surface-choice input{position:absolute;opacity:0;pointer-events:none}.yc-surface-choice:has(input:checked){border-color:var(--yc-theme,#a77cff);box-shadow:0 0 0 2px color-mix(in srgb,var(--yc-theme,#a77cff) 12%,transparent)}.yc-surface-preview{height:42px;border-radius:9px;border:1px solid rgba(128,138,180,.22);overflow:hidden;position:relative}.yc-surface-preview:before,.yc-surface-preview:after{content:"";position:absolute;border-radius:5px}.yc-surface-preview:before{inset:6px 22px 6px 6px}.yc-surface-preview:after{right:6px;top:6px;bottom:6px;width:11px}.yc-surface-preview.dark{background:linear-gradient(145deg,#080c18,#19152d)}.yc-surface-preview.dark:before{background:#121a2b}.yc-surface-preview.dark:after{background:#2b2145}.yc-surface-preview.white{background:linear-gradient(145deg,#eef1f8,#fff)}.yc-surface-preview.white:before{background:#fff;border:1px solid #d9deea}.yc-surface-preview.white:after{background:#e7eaf3}.yc-surface-choice strong{display:block;color:var(--yc-surface-text);font-size:12px}.yc-surface-choice small{display:block;color:var(--yc-surface-muted);font-size:10px;margin-top:3px;line-height:1.35}
@media(max-width:560px){.yc-surface-theme-picker{grid-template-columns:1fr}}
html[data-yc-surface-theme] body.yc-wotlk-theme{background:inherit!important}
</style>
`;

const settingsRuntime=String.raw\`
const YC_SURFACE_THEME_KEY='yc_surface_theme_v1';
function ycSurfaceThemeGet(){return localStorage.getItem(YC_SURFACE_THEME_KEY)==='white'?'white':'dark'}
function ycSurfaceThemeApply(value,persist=true){
 const v=value==='white'?'white':'dark';
 document.documentElement.dataset.ycSurfaceTheme=v;
 if(document.body){document.body.dataset.ycSurfaceTheme=v;document.body.classList.remove('yc-wotlk-theme')}
 if(persist)try{localStorage.setItem(YC_SURFACE_THEME_KEY,v)}catch{}
 return v;
}
function ycSurfaceThemeRender(){
 const current=ycSurfaceThemeGet();
 return '<div class="yc-surface-theme-picker"><label class="yc-surface-choice"><input type="radio" name="ycSurfaceTheme" value="dark" '+(current==='dark'?'checked':'')+'><span class="yc-surface-preview dark"></span><span><strong>Dark · výchozí</strong><small>Tmavý modro-fialový Yamachat styl s jemným glow.</small></span></label><label class="yc-surface-choice"><input type="radio" name="ycSurfaceTheme" value="white" '+(current==='white'?'checked':'')+'><span class="yc-surface-preview white"></span><span><strong>White</strong><small>Světlý, měkký motiv se stejnou osobní akcentní barvou.</small></span></label></div>';
}
function ycSurfaceThemeBind(root){
 root?.querySelectorAll('input[name="ycSurfaceTheme"]').forEach(r=>r.onchange=()=>{if(!r.checked)return;ycSurfaceThemeApply(r.value,true);try{toast('Vzhled Yamachatu změněn.')}catch{}});
}
window.YamachatSurfaceTheme={get:ycSurfaceThemeGet,apply:ycSurfaceThemeApply};
ycSurfaceThemeApply(ycSurfaceThemeGet(),false);
ycRegisterAppSettingsSection({id:'appearance',title:'Vzhled Yamachatu',description:'Globální pozadí a panely. Tvoje osobní akcentní barva zůstává samostatně.',render:ycSurfaceThemeRender,bind:ycSurfaceThemeBind});
\`;

const runtime=String.raw\`
<script id="ycSurfaceThemeRuntime">
(()=>{
 const api=window.YamachatSurfaceTheme;
 if(api?.apply)api.apply(api.get(),false);
 const strip=()=>{if(document.body?.classList.contains('yc-wotlk-theme'))document.body.classList.remove('yc-wotlk-theme')};
 if(document.body){strip();new MutationObserver(strip).observe(document.body,{attributes:true,attributeFilter:['class']})}
})();
</script>
\`;

export function withYamachatSurfaceTheme(html){
 const settingsAnchor="ycRegisterAppSettingsSection({id:'window'";
 for(const marker of ['</head>','</body>',settingsAnchor,'yc-wotlk-theme'])if(!html.includes(marker))throw Error('Yamachat surface theme insertion boundary missing: '+marker);
 if(html.includes('ycSurfaceThemeStyle'))return html;
 html=html.replace(settingsAnchor,settingsRuntime+'\\n'+settingsAnchor);
 html=html.replace('</head>',early+'\\n'+style+'\\n</head>');
 return html.replace('</body>',runtime+'\\n</body>');
}
