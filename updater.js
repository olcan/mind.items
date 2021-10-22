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
    });
  });
}

async function update_item(item) {
  console.log(`updating item ${item.name} ...`)
  // get last commit sha
  // get latest content for item, including any embeds
  // replace updated item
  // log the update
}