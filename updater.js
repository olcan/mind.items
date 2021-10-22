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
          // TODO: test change to embed
          if (!item.attr?.path) return // not an installed item or missing path          
          let paths = [item.attr.path, ...(item.attr.embeds?.map(e => e.path) ?? [])]
          paths = paths.map(path=>path.replace(/^\//, "")) // remove leading slashes
          if (paths.some(path=>commit.modified.includes(path)))
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
