function _on_welcome() {
  _items().forEach((item) => {
    if (item.attr) update_item(item);
  });

  // listen for github webhooks through firebase
  console.log(`listening for github_webhooks ...`);
  firebase
    .firestore()
    .collection("github_webhooks")
    .where("time", ">", Date.now())
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type != "added") return; // new documents only
        const body = change.doc.data().body;
        if (!body?.ref?.startsWith("refs/heads/")) return; // branch updates only
        console.log("received github_webhooks", change.doc.data());

        const branch = body.ref.replace("refs/heads/", "");
        const repo = body.repository.name;
        const owner = body.repository.owner.login;
        const commits = (body.commits ?? []).filter((c) => c.modified?.length);
        if (commits.length == 0) return; // no commits w/ modifications

        // scan items for installed items w/ modified paths
        _items().forEach((item) => {
          if (!item.attr) return; // item not installed
          if (
            item.attr.owner != owner ||
            item.attr.repo != repo ||
            item.attr.branch != branch
          )
            return; // item not from modified repo/branch
          // calculate item paths, including any embeds, removing slash prefixes
          let paths = [
            item.attr.path,
            ...(item.attr.embeds?.map((e) => e.path) ?? []),
          ].map((path) => path.replace(/^\//, ""));
          // update item if any paths were modified in any commits
          if (
            commits.some((commit) =>
              paths.some((path) => commit.modified.includes(path))
            )
          )
            update_item(item);
        });
      });
    });
}

async function update_item(item) {
  console.log(`updating item ${item.name} ..`);
  // get last commit sha
  // get latest content for item, including any embeds
  // replace updated item
  // log the update
}
