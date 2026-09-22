if(window.Capacitor?.isNativePlatform?.()){
 ycAppSettingsSections.delete('web');
 ycWinPermission=async()=>await window.ycNativeNotificationPermission?.()||false;
 window.yamachatDesktop.showNotification=async payload=>await window.ycNativeShowNotification?.(payload)||false;
 ycRegisterAppSettingsSection({id:'native',title:'Telefon a oznámení',description:'Oznámení zpráv přijatých běžící aplikací.',render:()=>'<button type="button" class="ghost" id="ycNativeAllowNotify">Povolit oznámení</button><p id="ycNativeNotifyStatus" role="status"></p><p>Po úplném ukončení aplikace se nové zprávy načtou při jejím otevření. Hovor při zamknutí telefonu může systém přerušit.</p>',bind:root=>{root.querySelector('#ycNativeAllowNotify').onclick=async()=>{const result=await window.ycNativeRequestNotifications?.();root.querySelector('#ycNativeNotifyStatus').textContent=result?.granted?'Oznámení jsou povolená.':'Oznámení povol v systémovém nastavení aplikace.'}}});
}
