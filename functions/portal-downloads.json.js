// Fixed public distribution destinations only. No credentials or user data.
export async function onRequestGet() {
  const items=[
    {label:'Windows instalátor',url:'https://updates.yamachat.eu/yamaportal/Yamaportal-Setup-latest.exe'},
    {label:'Windows portable',url:'https://updates.yamachat.eu/yamaportal/Yamaportal-Portable-latest.exe'}
  ];
  const downloads=await Promise.all(items.map(async item=>{
    try {
      const response=await fetch(item.url,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(8000)});
      return {...item,available:response.status===200 && Number(response.headers.get('content-length'))>1000000};
    } catch { return {...item,available:false}; }
  }));
  return Response.json({checkedAt:new Date().toISOString(),preview:false,downloads},{headers:{'Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
}
