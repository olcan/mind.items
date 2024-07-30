// macro for agent controls
function agent_controls(styles) {
  const byte_length = x => (x ? encode(stringify(x), 'utf8_array').length : 0)
  // TODO: make this state-sensitive
  // TODO: handle .../run items created for installed agent items
  return _div(
    '',
    [
      link_command('/start ' + _name, 'start'),
      link_command('/stop ' + _name, 'stop'),
      link_command('/inspect ' + _name, 'inspect'),
      _span(
        '',
        byte_length(_this.store.agent?.state) + ' bytes',
        'style="opacity:.75"'
      ),
    ].join(' '),
    `style="background:rgba(255, 255, 255, 0.025);border-top:1px solid #222;border-bottom:1px solid #222;margin:10px -10px -10px -10px;padding:5px;${styles}"`
  )
}
