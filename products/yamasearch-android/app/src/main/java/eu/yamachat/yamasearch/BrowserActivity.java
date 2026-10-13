package eu.yamachat.yamasearch;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ClipDescription;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Native Android browser shell. Every tab owns a real WebView; no web site is wrapped as the app UI. */
public class BrowserActivity extends Activity {
    private static final String HOME = "https://yamachat.eu";
    private static final int REQUEST_WEB_PERMISSION = 41;
    private final List<BrowserTab> tabs = new ArrayList<>();
    private final List<String> adHosts = List.of("doubleclick.net", "googlesyndication.com", "google-analytics.com", "facebook.net");
    private FrameLayout webHost;
    private LinearLayout tabStrip;
    private EditText address;
    private BrowserTab active;
    private boolean privateMode;
    private ValueCallback<Uri[]> fileChooser;
    private PermissionRequest pendingWebPermission;
    private String[] pendingWebResources;
    private String pendingGeolocationOrigin;
    private GeolocationPermissions.Callback pendingGeolocationCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        privateMode = isPrivateMode();
        if (privateMode) WebView.setDataDirectorySuffix("yamasearch-incognito");
        buildUi();
        addTab(getIntent().getStringExtra("url"), true);
    }

    protected boolean isPrivateMode() { return false; }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(Color.rgb(8,17,29));
        LinearLayout toolbar = new LinearLayout(this); toolbar.setPadding(dp(8), dp(8), dp(8), dp(6)); toolbar.setGravity(Gravity.CENTER_VERTICAL);
        addTool(toolbar, "‹", v -> { if (active.web.canGoBack()) active.web.goBack(); });
        addTool(toolbar, "›", v -> { if (active.web.canGoForward()) active.web.goForward(); });
        addTool(toolbar, "↻", v -> active.web.reload());
        address = new EditText(this); address.setSingleLine(true); address.setTextColor(Color.WHITE); address.setTextSize(15); address.setHintTextColor(Color.rgb(145,170,195)); address.setHint("Adresa nebo hledání"); address.setBackgroundColor(Color.rgb(20,42,67)); address.setPadding(dp(12),0,dp(12),0);
        address.setOnEditorActionListener((v, action, event) -> { navigate(address.getText().toString()); return true; });
        toolbar.addView(address, new LinearLayout.LayoutParams(0, dp(44), 1));
        addTool(toolbar, "＋", v -> addTab(null, true));
        addTool(toolbar, "☰", v -> showMenu());
        root.addView(toolbar, new LinearLayout.LayoutParams(-1, -2));
        HorizontalScrollView tabScroller = new HorizontalScrollView(this); tabScroller.setHorizontalScrollBarEnabled(false); tabStrip = new LinearLayout(this); tabStrip.setPadding(dp(8),0,dp(8),dp(6)); tabScroller.addView(tabStrip); root.addView(tabScroller, new LinearLayout.LayoutParams(-1, dp(44)));
        webHost = new FrameLayout(this); root.addView(webHost, new LinearLayout.LayoutParams(-1,0,1)); setContentView(root);
    }

    private void addTool(LinearLayout host, String label, View.OnClickListener click) { Button b = new Button(this); b.setText(label); b.setTextColor(Color.rgb(125,231,255)); b.setTextSize(20); b.setBackgroundColor(Color.TRANSPARENT); b.setOnClickListener(click); host.addView(b,new LinearLayout.LayoutParams(dp(44),dp(44))); }

    private void addTab(String url, boolean select) {
        BrowserTab tab = new BrowserTab(); tab.web = makeWebView(tab); tab.title = "Nová karta"; tabs.add(tab);
        tab.web.loadUrl(url == null || url.isBlank() ? HOME : url); if (select) selectTab(tab); renderTabs();
    }

    private WebView makeWebView(BrowserTab tab) {
        WebView web = new WebView(this); WebSettings s = web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setDatabaseEnabled(true); s.setMediaPlaybackRequiresUserGesture(false); s.setSupportMultipleWindows(true); s.setJavaScriptCanOpenWindowsAutomatically(true); s.setLoadWithOverviewMode(true); s.setUseWideViewPort(true); s.setUserAgentString(s.getUserAgentString()+" YamaSearchAndroid/0.1");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { view.loadUrl(request.getUrl().toString()); return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) { Uri uri=request.getUrl(); if (isBlocked(uri)) return new WebResourceResponse("text/plain","utf-8",null); return super.shouldInterceptRequest(view,request); }
            @Override public void onPageFinished(WebView view, String u) { tab.title=view.getTitle()==null?host(u):view.getTitle(); if(tab==active){address.setText(u);} remember(u,tab.title); renderTabs(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onReceivedTitle(WebView view,String title){ tab.title=title; renderTabs(); }
            @Override public boolean onCreateWindow(WebView view,boolean dialog,boolean userGesture,android.os.Message resultMsg){ addTab(null,true); WebView.WebViewTransport t=(WebView.WebViewTransport)resultMsg.obj; t.setWebView(active.web); resultMsg.sendToTarget(); return true; }
            @Override public void onPermissionRequest(PermissionRequest request){ requestWebPermission(request); }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback){
                if(has(Manifest.permission.ACCESS_FINE_LOCATION)) { callback.invoke(origin,true,false); return; }
                clearPendingPermissions();
                pendingGeolocationOrigin=origin; pendingGeolocationCallback=callback;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION},REQUEST_WEB_PERMISSION);
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params){ fileChooser=callback; Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT); pick.addCategory(Intent.CATEGORY_OPENABLE); pick.setType("*/*"); startActivityForResult(pick,88); return true; }
            @Override public void onShowCustomView(View view, CustomViewCallback cb){ setContentView(view); }
        });
        web.setDownloadListener(downloadListener()); return web;
    }

    private void requestWebPermission(PermissionRequest request) {
        List<String> needed=new ArrayList<>(); for(String resource:request.getResources()){ if(PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) needed.add(Manifest.permission.CAMERA); if(PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) needed.add(Manifest.permission.RECORD_AUDIO); }
        if(needed.isEmpty()){request.deny();return;}
        boolean granted=true; for(String p:needed)granted&=has(p);
        if(granted){request.grant(request.getResources()); return;}
        clearPendingPermissions();
        pendingWebPermission=request;
        pendingWebResources=request.getResources();
        requestPermissions(needed.toArray(new String[0]),REQUEST_WEB_PERMISSION);
    }

    private DownloadListener downloadListener(){ return (url,ua,disposition,mime,length)->{ String fileName=URLUtil.guessFileName(url,disposition,mime); DownloadManager.Request r=new DownloadManager.Request(Uri.parse(url)); r.setMimeType(mime); r.addRequestHeader("User-Agent",ua); r.setTitle(fileName); r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED); r.setDestinationInExternalFilesDir(this,Environment.DIRECTORY_DOWNLOADS,fileName); ((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(r); toast("Stahování spuštěno"); }; }
    private boolean isBlocked(Uri uri){ String h=uri.getHost(); if(h==null)return false; for(String blocked:adHosts)if(h.equals(blocked)||h.endsWith("."+blocked))return true; return false; }
    private void navigate(String value){ value=value.trim(); if(value.isEmpty())return; String u=value.matches("^[a-zA-Z][a-zA-Z0-9+.-]*://.*")?value:(value.contains(".")&&!value.contains(" ")?"https://"+value:"https://duckduckgo.com/?q="+URLEncoder.encode(value, StandardCharsets.UTF_8)); active.web.loadUrl(u); }
    private void selectTab(BrowserTab tab){ active=tab; webHost.removeAllViews(); webHost.addView(tab.web,new FrameLayout.LayoutParams(-1,-1)); address.setText(tab.web.getUrl()==null?"":tab.web.getUrl()); renderTabs(); }
    private void renderTabs(){ if(tabStrip==null)return; tabStrip.removeAllViews(); for(BrowserTab tab:tabs){ Button b=new Button(this); String title=(tab==active?"● ":"")+trim(tab.title); b.setText(title); b.setTextColor(Color.WHITE); b.setTextSize(12); b.setAllCaps(false); b.setBackgroundColor(tab==active?Color.rgb(27,66,100):Color.rgb(14,30,48)); b.setOnClickListener(v->selectTab(tab)); b.setOnLongClickListener(v->{closeTab(tab);return true;}); tabStrip.addView(b,new LinearLayout.LayoutParams(dp(150),dp(38))); } }
    private void closeTab(BrowserTab tab){ if(tabs.size()==1){tab.web.loadUrl(HOME);return;} int i=tabs.indexOf(tab); tabs.remove(tab); tab.web.destroy(); if(tab==active)selectTab(tabs.get(Math.max(0,i-1))); else renderTabs(); }
    @Override public void onBackPressed(){ if(active!=null&&active.web.canGoBack())active.web.goBack();else super.onBackPressed(); }
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==88&&fileChooser!=null){fileChooser.onReceiveValue(result==RESULT_OK&&data!=null?new Uri[]{data.getData()}:null);fileChooser=null;}}
    @Override public void onRequestPermissionsResult(int request,String[] p,int[] results){
        super.onRequestPermissionsResult(request,p,results);
        if(request!=REQUEST_WEB_PERMISSION)return;
        boolean granted=results.length>0;
        for(int result:results)granted&=result==PackageManager.PERMISSION_GRANTED;
        if(pendingWebPermission!=null){
            if(granted)pendingWebPermission.grant(pendingWebResources); else pendingWebPermission.deny();
        }
        if(pendingGeolocationCallback!=null)pendingGeolocationCallback.invoke(pendingGeolocationOrigin,granted,false);
        clearPendingPermissions();
    }
    private void clearPendingPermissions(){ pendingWebPermission=null; pendingWebResources=null; pendingGeolocationOrigin=null; pendingGeolocationCallback=null; }
    @Override protected void onDestroy(){ if(privateMode){ CookieManager.getInstance().removeAllCookies(null); WebStorage.getInstance().deleteAllData(); } super.onDestroy(); }

    private void showMenu(){ String[] actions={"Domů","Oblíbené","Historie","Nové anonymní okno","Nastavení webu"}; new AlertDialog.Builder(this).setTitle(privateMode?"YamaSearch · anonymní":"YamaSearch").setItems(actions,(d,which)->{switch(which){case 0:active.web.loadUrl(HOME);break;case 1:showSaved("Oblíbené",true);break;case 2:showSaved("Historie",false);break;case 3:startActivity(new Intent(this,PrivateBrowserActivity.class));break;case 4:toast("Oprávnění spravuje systém Android a konkrétní web.");}}).show(); }
    private void showSaved(String title,boolean bookmarks){ SharedPreferences p=getSharedPreferences("yamasearch",MODE_PRIVATE); Set<String> saved=p.getStringSet(bookmarks?"bookmarks":"history",new LinkedHashSet<>()); String[] rows=saved.toArray(new String[0]); new AlertDialog.Builder(this).setTitle(title).setItems(rows,(d,i)->navigate(rows[i].split("\\n")[0])).setPositiveButton(bookmarks?"Přidat aktuální":"Zavřít",(d,w)->{if(bookmarks)save("bookmarks",active.web.getUrl());}).show(); }
    private void remember(String url,String title){if(!privateMode)save("history",url+"\n"+title);}
    private void save(String key,String value){ if(privateMode)return; SharedPreferences p=getSharedPreferences("yamasearch",MODE_PRIVATE); LinkedHashSet<String>s=new LinkedHashSet<>(p.getStringSet(key,new LinkedHashSet<>()));s.remove(value);s.add(value);while(s.size()>100){s.remove(s.iterator().next());}p.edit().putStringSet(key,s).apply(); }
    private boolean has(String permission){return checkSelfPermission(permission)==PackageManager.PERMISSION_GRANTED;}
    private String host(String url){try{return Uri.parse(url).getHost();}catch(Exception e){return url;}}
    private String trim(String s){if(s==null||s.isBlank())return "Nová karta";return s.length()>20?s.substring(0,19)+"…":s;}
    private int dp(int v){return (int)(v*getResources().getDisplayMetrics().density);}
    private void toast(String s){android.widget.Toast.makeText(this,s,android.widget.Toast.LENGTH_SHORT).show();}
    private static class BrowserTab{WebView web;String title;}
}
