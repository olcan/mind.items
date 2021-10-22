function _on_welcome() {
  _items().forEach(item => { 
    if (item.attr) update_item(item) 
  })

  // listen for github webhooks through firebase
  console.log(`listening for github_webhooks ...`)
  firebase
  .firestore()
  .collection("github_webhooks")
  .where("time", ">", Date.now())
  .onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type != "added") return; // new documents only
      console.log("received github_webhooks", change.doc.data());
      // scan commits for modifications to item source paths ...
      const commits = change.doc.data().body?.commits ?? []
      commits.forEach(commit => {
        if (!commit.modified?.length) return; // modified paths only
        _items().forEach(item => { 
          // TODO: filter by attr.owner/repo/branch!
          // TODO: also detect embed paths!
          if (!item.attr?.path) return // not an installed item or missing path
          const path = item.attr.path.replace(/^\//, "") // drop / prefix to normalize
          if (commit.modified.includes(path))
            update_item(item)
        })
      })
    });
  });
}

async function update_item(item) {
  console.log(`updating item ${item.name} ..`)
  // get last commit sha
  // get latest content for item, including any embeds
  // replace updated item
  // log the update
}
