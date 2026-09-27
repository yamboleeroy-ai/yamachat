import fs from 'node:fs';

const clientPath='desktop/desktop-client.html';
const mainPath='desktop/main.js';

let html=fs.readFileSync(clientPath,'utf8');

function replaceAllRequired(from,to,label,min=1){
  const count=html.split(from).length-1;
  if(count<min)throw new Error(`Missing identity-preview boundary: ${label} (found ${count})`);
  html=html.split(from).join(to);
  return count;
}

// Remove legacy Discord-shaped internal component names without touching provider/database compatibility.
replaceAllRequired('discord-voice-buttons','yc-voice-buttons','voice controls class');
replaceAllRequired('discord-link','yc-identity-link','profile identity class');
replaceAllRequired('yc-discord-avatar-','yc-linked-avatar-','linked avatar classes');
replaceAllRequired('ycDiscordAvatarChoice','ycLinkedAvatarChoice','linked avatar element id');
replaceAllRequired('ycGetDiscordIdentity','ycGetLinkedIdentity','linked identity helper');
replaceAllRequired('/* global Steam x Discord skin  */','/* Legacy global skin compatibility layer. */','legacy skin comment');
replaceAllRequired('/* Discord avatar source choice */','/* Linked account avatar source choice. */','linked avatar comment');
replaceAllRequired('// Discord avatar is optional. Uploaded Yamachat avatar is never overwritten.','// Linked account avatar is optional. Uploaded Yamachat avatar is never overwritten.','linked avatar runtime comment');

// User-visible terminology only. Backend/API/server identifiers stay unchanged.
for(const [from,to] of [
  ['Nastavení serveru','Nastavení komunity'],
  ['Opustit server','Opustit komunitu'],
  ['Veřejný server','Veřejná komunita'],
  ['Soukromý server','Soukromá komunita'],
  ['Miniatura serveru','Miniatura komunity'],
  ['Server zatím nemá popis.','Komunita zatím nemá popis.'],
  ['Načítám informace o serveru…','Načítám informace o komunitě…'],
  ['Uvidí ho všichni členové serveru.','Uvidí ji všichni členové komunity.'],
  ['Miniaturu může měnit vlastník nebo administrátor serveru.','Miniaturu může měnit vlastník nebo administrátor komunity.'],
  ['Zkratka serveru obnovena.','Zkratka komunity obnovena.'],
  ['Miniatura serveru uložena.','Miniatura komunity uložena.'],
  ['Barva serveru: ','Barva komunity: '],
  ['Nový název serveru:','Nový název komunity:'],
  ['Název serveru musí mít 2 až 48 znaků.','Název komunity musí mít 2 až 48 znaků.'],
  ['Přejmenování serveru: ','Přejmenování komunity: '],
  ['Server byl přejmenován.','Komunita byla přejmenována.'],
  ['Server otevřen v režimu Platform Admin.','Komunita otevřena v režimu Platform Admin.']
]){
  html=html.split(from).join(to);
}


// Continue the user-visible Czech terminology cleanup on Windows only.
// Exact phrases are used deliberately so backend/API/internal server identifiers stay untouched.
for(const [from,to] of [
  ['Nabídka serveru','Nabídka komunity'],
  ['Správa serveru / přejmenování','Správa komunity / přejmenování'],
  ['Správa serverových emoji','Správa komunitních emoji'],
  ['← Servery','← Komunity'],
  ['Platform Admin · servery','Platform Admin · komunity'],
  ['Hledat server, popis nebo vlastníka…','Hledat komunitu, popis nebo vlastníka…'],
  ['Žádné servery.','Žádné komunity.'],
  ['Server nemá členy.','Komunita nemá členy.'],
  ['Viditelnost serveru změněna.','Viditelnost komunity změněna.'],
  ['SMAZÁNÍ PLATFORM ADMIN: napiš přesně název serveru ','SMAZÁNÍ PLATFORM ADMIN: napiš přesně název komunity '],
  ['Server byl smazán Platform Adminem.','Komunita byla smazána Platform Adminem.'],
  [' ze serveru?',' z komunity?'],
  ['Porušení pravidel serveru','Porušení pravidel komunity'],
  ['Otevřít server','Otevřít komunitu'],
  ['Server už neexistuje.','Komunita už neexistuje.'],
  ['Barvu serveru může měnit jen vlastník.','Barvu komunity může měnit jen vlastník.'],
  ['Barva serveru','Barva komunity'],
  ['🎨 Barva serveru · ','🎨 Barva komunity · '],
  ['Tato barva patří serveru. Uvidí ji všichni členové na hlavičce serveru a na jeho ikoně. Osobní barva Yamachatu každého uživatele zůstává beze změny.','Tato barva patří komunitě. Uvidí ji všichni členové na hlavičce komunity a na její ikoně. Osobní barva Yamachatu každého uživatele zůstává beze změny.'],
  ['Vlastní barva serveru','Vlastní barva komunity'],
  ['Uložit barvu serveru','Uložit barvu komunity'],
  ['Barva serveru byla uložena.','Barva komunity byla uložena.'],
  ['Na přejmenování serveru nemáš oprávnění.','Na přejmenování komunity nemáš oprávnění.'],
  ['Přejmenovat server','Přejmenovat komunitu'],
  ['Emoji serveru','Emoji komunity'],
  ['Server zatím nemá vlastní emoji.','Komunita zatím nemá vlastní emoji.'],
  ['Správa serveru','Správa komunity'],
  ['Vytváření pozvánek na server.','Vytváření pozvánek do komunity.'],
  ['Kick členů ze serveru.','Kick členů z komunity.'],
  ['Správa zvuků serveru.','Správa zvuků komunity.'],
  ['Vzhled serverové karty','Vzhled komunitní karty'],
  ['Přehled serveru','Přehled komunity'],
  ['Profil serveru','Profil komunity'],
  ['Název serveru','Název komunity'],
  ['Nastavení serveru uloženo.','Nastavení komunity uloženo.'],
  ['Pozadí hlavičky serveru','Pozadí hlavičky komunity'],
  ['Ke změně pozadí potřebuješ oprávnění Správa serveru.','Ke změně pozadí potřebuješ oprávnění Správa komunity.'],
  ['Viditelnost serveru','Viditelnost komunity'],
  ['Veřejný server lze najít v procházení. Soukromý server je dostupný pouze přes pozvánku.','Veřejnou komunitu lze najít v procházení. Soukromá komunita je dostupná pouze přes pozvánku.'],
  ['Server je viditelný v katalogu komunit.','Komunita je viditelná v katalogu komunit.'],
  ['Server je skrytý a vstup je pouze přes pozvánku.','Komunita je skrytá a vstup je pouze přes pozvánku.'],
  ['Server je nyní veřejný.','Komunita je nyní veřejná.'],
  ['Server je nyní soukromý.','Komunita je nyní soukromá.'],
  ['Barvy, oprávnění a pořadí členů serveru','Barvy, oprávnění a pořadí členů komunity'],
  ['Moderace členů a ochrana serveru','Moderace členů a ochrana komunity'],
  ['Serverová role nikdy nepřebírá vlastnictví serveru. Owner zůstává oddělený a nelze ho přepsat běžnou rolí.','Komunitní role nikdy nepřebírá vlastnictví komunity. Owner zůstává oddělený a nelze ho přepsat běžnou rolí.'],
  ['Textové a hlasové místnosti tohoto serveru','Textové a hlasové místnosti této komunity'],
  ['Správa obsahu tohoto serveru','Správa obsahu této komunity'],
  ['Odkaz pro připojení k serveru','Odkaz pro připojení ke komunitě'],
  ['Odkaz umožní připojení i k soukromému serveru.','Odkaz umožní připojení i k soukromé komunitě.'],
  ['Neobnovitelné odstranění serveru','Neobnovitelné odstranění komunity'],
  ['Zrušit server','Zrušit komunitu'],
  ['Odstraní server a jeho obsah. Tuto akci může provést pouze vlastník.','Odstraní komunitu a její obsah. Tuto akci může provést pouze vlastník.'],
  ['Pouze vlastník může zrušit server.','Pouze vlastník může zrušit komunitu.'],
  ['Nový server','Nová komunita'],
  ['Vytvořit server','Vytvořit komunitu'],
  ['Server vytvořen.','Komunita vytvořena.'],
  ['Nejdřív vyber server.','Nejdřív vyber komunitu.'],
  ['Nemáš oprávnění spravovat tento server.','Nemáš oprávnění spravovat tuto komunitu.'],
  ['Komunity / servery','Komunity'],
  ['Nemáš oprávnění měnit vzhled tohoto serveru.','Nemáš oprávnění měnit vzhled této komunity.'],
  ['Server zatím nemá žádné běžné role.','Komunita zatím nemá žádné běžné role.'],
  ['Načítám serverové role…','Načítám komunitní role…'],
  ['vlastník nebo administrátor serveru','vlastník nebo administrátor komunity'],
  ['serverovým rolím','komunitním rolím'],
  ['Server se mezitím změnil.','Komunita se mezitím změnila.'],
  ['všem členům serveru.','všem členům komunity.'],
  ['serveroví administrátoři','komunitní administrátoři'],
  ['členům serveru.','členům komunity.'],
  ['Přidat server nebo uživatele','Přidat komunitu nebo uživatele'],
  ['Přidat server','Přidat komunitu'],
  ['Servery','Komunity'],
  ['Info o serveru','Info o komunitě'],
  ['Použít nastavení serveru','Použít nastavení komunity']
]){
  html=html.split(from).join(to);
}
html=html.replace(
  "const privacy=typeof c.is_public==='boolean'?(c.is_public?'Veřejná komunita':'Soukromá komunita'):'Server';",
  "const privacy=typeof c.is_public==='boolean'?(c.is_public?'Veřejná komunita':'Soukromá komunita'):'Komunita';"
);

const style=`
<style id="ycWindowsIdentityPreviewStyle">
/* Windows-only identity preview. Shared Web/PWA/mobile sources are intentionally untouched. */
@media (min-width:1101px){
  body .app .yc-v3-ribbon .rail{gap:7px!important}
  body .app .yc-v3-ribbon .server,
  body .app .yc-v3-ribbon .server.browse,
  body .app .yc-v3-ribbon .server.add,
  body .app .yc-v3-ribbon .yc-platform-admin-rail{
    flex:0 0 116px!important;width:116px!important;height:68px!important;min-height:68px!important;
    padding:8px 9px!important;gap:7px!important;border-radius:13px!important;
    justify-content:flex-start!important;text-align:left!important;
  }
  body .app .yc-v3-ribbon .server[data-community]{
    background:
      linear-gradient(115deg,color-mix(in srgb,var(--yc-server-color,var(--yc-theme)) 13%,#0a1822),#08141d 56%,color-mix(in srgb,var(--yc-server-color,var(--yc-theme)) 7%,#071019))!important;
    border:1px solid color-mix(in srgb,var(--yc-server-color,var(--yc-theme)) 42%,#314b59)!important;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 0 10px color-mix(in srgb,var(--yc-server-color,var(--yc-theme)) 8%,transparent)!important;
  }
  body .app .yc-v3-ribbon .server[data-community]:hover{
    transform:none!important;
    border-color:color-mix(in srgb,var(--yc-server-color,var(--yc-theme)) 61%,#d8f6ff)!important;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 0 12px color-mix(in srgb,var(--yc-server-color,var(--yc-theme)) 13%,transparent)!important;
  }
  body .app .yc-v3-ribbon .server[data-community].active,
  body .app .yc-v3-ribbon .server[data-community].yc-server-glow{
    border-color:color-mix(in srgb,var(--yc-theme,#e056fd) 60%,#96dbe9)!important;
    background:
      linear-gradient(115deg,color-mix(in srgb,var(--yc-theme,#e056fd) 17%,#0a1822),#0a1924 60%,color-mix(in srgb,var(--yc-server-color,var(--yc-theme)) 10%,#071019))!important;
    box-shadow:
      inset 3px 0 10px color-mix(in srgb,var(--yc-theme,#e056fd) 12%,transparent),
      0 0 11px color-mix(in srgb,var(--yc-theme,#e056fd) 14%,transparent)!important;
  }
  body .app .yc-v3-ribbon .server .yc-v3-community-mark{
    width:36px!important;height:36px!important;flex:0 0 36px!important;border-radius:9px!important;
    font-size:13px!important;box-shadow:inset 0 1px rgba(255,255,255,.08),0 0 8px color-mix(in srgb,var(--yc-server-color,var(--yc-theme)) 10%,transparent)!important;
  }
  body .app .yc-v3-ribbon .server .yc-v3-community-copy{display:block!important;min-width:0!important;overflow:hidden!important}
  body .app .yc-v3-ribbon .server .yc-v3-community-copy strong{
    display:block!important;font-size:11px!important;font-weight:820!important;line-height:1.18!important;
    white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;color:#edf8fb!important;
  }
  body .app .yc-v3-ribbon .server .yc-v3-community-copy small{display:none!important}
}
@media (min-width:1101px) and (max-width:1399px){
  body .app .yc-v3-ribbon .server,
  body .app .yc-v3-ribbon .server.browse,
  body .app .yc-v3-ribbon .server.add,
  body .app .yc-v3-ribbon .yc-platform-admin-rail{flex-basis:104px!important;width:104px!important}
}
@media (min-width:1101px) and (max-width:1199px){
  body .app .yc-v3-ribbon .server,
  body .app .yc-v3-ribbon .server.browse,
  body .app .yc-v3-ribbon .server.add,
  body .app .yc-v3-ribbon .yc-platform-admin-rail{flex-basis:96px!important;width:96px!important;padding-left:7px!important;padding-right:7px!important}
  body .app .yc-v3-ribbon .server .yc-v3-community-mark{width:34px!important;height:34px!important;flex-basis:34px!important}
  body .app .yc-v3-ribbon .server .yc-v3-community-copy strong{font-size:10px!important}
}

/* Yamachat presence: keep status meaning, replace ordinary round dots with a faceted diamond. */
.yc-avatar-presence-dot,
.yc-presence-dot,
.me[data-presence-mode]::after,
.status-dot{
  border-radius:2px!important;
  clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)!important;
}
.yc-avatar-presence-dot{
  width:11px!important;height:11px!important;border:0!important;
  box-shadow:0 0 0 2px #07131f,0 0 7px rgba(var(--yc-presence-rgb),.72)!important;
}
.yc-presence-offline>.yc-avatar-presence-dot{box-shadow:0 0 0 2px #07131f!important}
.yc-presence-dot{border-width:1px!important}
.me[data-presence-mode]::after{width:10px!important;height:10px!important;flex-basis:10px!important}
.status-dot{width:10px!important;height:10px!important}

/* Provider connection remains supported, but its container is Yamachat-owned UI. */
.yc-identity-link{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding:10px;background:#151b2c;border:1px solid #3b4265}
.yc-identity-link strong{color:#b9bfff}
</style>
`;
if(html.includes('id="ycWindowsIdentityPreviewStyle"'))throw new Error('Identity preview style already applied');
if(!html.includes('</head>'))throw new Error('Desktop client head boundary missing');
html=html.replace('</head>',style+'\n</head>');

for(const banned of [
  'discord-voice-buttons',
  'class="discord-link"',
  '.discord-link',
  'yc-discord-avatar-',
  'ycDiscordAvatarChoice',
  'ycGetDiscordIdentity',
  '/* global Steam x Discord skin  */',
  '/* Discord avatar source choice */',
  '// Discord avatar is optional.'
]){
  if(html.includes(banned))throw new Error('Legacy Discord-specific runtime name remains: '+banned);
}

fs.writeFileSync(clientPath,html);

let main=fs.readFileSync(mainPath,'utf8');
if(!main.includes("app.setName('Yamachat Preview');"))throw new Error('Preview app-name boundary missing');
if(!main.includes("'Yamachat-Stream-Preview'"))throw new Error('Preview profile boundary missing');
main=main.replace("app.setName('Yamachat Preview');","app.setName('Yamachat Identity Preview');");
main=main.replace("'Yamachat-Stream-Preview'","'Yamachat-Identity-Preview'");
fs.writeFileSync(mainPath,main);

console.log('PASS Windows identity preview patch applied');
