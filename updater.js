function _welcome() { update() }

async function update() {
  _items().forEach(item => { 
    if (item.attr) update_item(item) 
  })
}

async function update_item(item) {
  // get last commit sha
  // get latest content for item, including any embeds
  // replace updated item
  // log the update
}

// TODO: do more