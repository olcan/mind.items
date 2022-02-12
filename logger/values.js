function parse_values(text) {
  text = text.toLowerCase()
  const regex =
    /(?:^|[\s;])([a-zA-Z\s\$,'’"“”|]*)\s*([<>]?=?)\s*([+-]?(?:(?:\d+(?:\.\d+)?)|(?:\.\d+)))\s*(p|pts?|points?|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|c|cals?|calories?|lbs?|pounds?|kgs?|kilos?|kilograms?|\$|dollars?|usd)?(?=[\s,;\.:]|$)/g
  let values = Array.from(text.matchAll(regex), m => {
    let [match, name, comparison, number, unit] = m
    name = _.trim(name, ' ,') // trim spaces|commas around name
    if (name.endsWith('$')) {
      // allow $ unit as prefix
      name = name.substring(0, -1)
      unit = '$'
    }
    number = parseFloat(number)
    // standardize units
    if (unit) {
      if (unit.match(/^(?:p|pts?|points?)$/)) {
        unit = 'p'
      } else if (unit.match(/^(?:s|secs?|seconds?)$/)) {
        unit = 'h' // standard time unit
        number /= 60 * 60
      } else if (unit.match(/^(?:m|mins?|minutes?)$/)) {
        unit = 'h'
        number /= 60
      } else if (unit.match(/^(?:h|hrs?|hours?)$/)) {
        unit = 'h'
      } else if (unit.match(/^(?:d|days?)$/)) {
        unit = 'h'
        number *= 24
      } else if (unit.match(/^(?:c|cals?|calories?)$/)) {
        unit = 'c'
      } else if (unit.match(/^(?:lbs?|pounds?)$/)) {
        unit = 'lb'
      } else if (unit.match(/^(?:kgs?|kilos?|kilograms?)$/)) {
        unit = 'kg'
      } else if (unit.match(/^(?:\$|dollars?|usd)$/)) {
        unit = '$'
      }
    }
    const value = {}
    value.number = number
    if (name) value.name = name
    if (comparison) value.comparison = comparison
    if (unit) value.unit = unit
    return value
  })
  // aggregate values by unit (for unnamed non-comparison values)
  values = values.reduce((a, v) => {
    if (v.name || v.comparison || v.unit != _.last(a)?.unit) a.push(v)
    else if (a.length > 0) _.last(a).number += v.number
    return a
  }, [])
  // inherit missing names from prior named value
  // for (let i=1; i<values.length; ++i)
  // values[i].name = values[i].name || values[i-1].name
  return values
}
