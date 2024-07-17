#status <div class="instances"></div>
```_html_hidden
<script _uncached>
update_status() // do first update synchronously (on script eval)
dispatch_task('update', update_status, 1000, 1000) // update every second
// cancel_task('update')
</script>
<style>
#item p:first-child { display: inline }
#item .instances { display: inline }
#item table { /*white-space: nowrap;*/ border-spacing: 0 5px /* extra spacing */ }
#item table th { text-align: left; background: transparent }
#item table :not(thead) > tr { background: #171717 }
#item table :not(thead) > tr:first-of-type { background: #222 }
#item table td { padding: 2px 10px }
#item table td:first-child { border-radius: 4px 0 0 4px }
#item table td:last-child {  border-radius: 0 4px 4px 0 }
</style> 
```
```js_removed
function update_status() {
  if (!elem('.instances')) return
  elem('.instances').innerHTML = marked.parse(list_instances(),{breaks:true})
}
const device_name = x => [
  new UAParser(x.user_agent).getOS().name,
  x.screen_size.width + 'x' + x.screen_size.height
].join(' &nbsp; ')

function list_instances() {
  const devices = group(_instances, device_name)
  return [ 
    `${_instances.length} instances live on ~${size(devices)} devices:`,
    entries(devices).map(([device, instances])=>
      table(instances.map((x,j)=>{
        const ua = new UAParser(x.user_agent).getResult()
        const res = x.screen_size.width + 'x' + x.screen_size.height
        const fage = round((Date.now() - x.focus_time) / 1000)
        const uage = round((Date.now() - x.update_time) / 1000)
        // if client is connected locally, take server host name instead
        const ip = x.client_ip == '::1' ? x.server_name : x.client_ip
        // shorten gpu name on ANGLE (...) gpu reported by Chrome on Apple devices
        const bits = x.screen_colors.color_depth + '-bit'
        const cpu = x.hardware_concurrency + '-core'
        const gpu = x.gpu?.match(/ANGLE \(.+, (.+), .+/)?.pop() ?? x.gpu
        // note fage>uage (focus_time) is _delayed_ by up to uage
        // so fage uncertainty range is actually (fage-uage)-fage
        // but we still sort by last _confirmed_ focus so we display that
        // info listed after browser tends to be browser-dependent and thus unreliable
        return [
          [fage+'s', uage+'s'].join('<br>'),
          [res, ua.os.name].join('<br>'),
          [ua.browser.name, cpu, /*bits,*/ gpu].join('<br>'),
          [ip, '&nbsp;&nbsp;↳ '+x.server_domain].join('<br>'), 
        ]
      }), {headers:[device], alignments:'rrll'})
    ).join('\n\n')
  ].join('\n')
}
```
#_util