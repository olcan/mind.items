function _on_welcome() {
  init_updater();
}

async function init_updater() {
  // TODO: prompt for token if missing, strongly recommended for updater

  // check for updates on page init
  for (let item of installed_named_items()) {
    const has_updates = await check_updates(item);
    if (has_updates) await update_item(item);
  }

  // listen for updates through firebase
  console.log(`listening for updates ...`);
  firebase
    .firestore()
    .collection("github_webhooks")
    .where("time", ">", Date.now())
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type != "added") return; // new documents only
        const body = change.doc.data().body;
        if (!body?.ref?.startsWith("refs/heads/")) return; // branch updates only
        // console.debug("received github_webhooks", change.doc.data());

        const branch = body.ref.replace("refs/heads/", "");
        const repo = body.repository.name;
        const owner = body.repository.owner.login;
        const commits = (body.commits ?? []).filter((c) => c.modified?.length);
        if (commits.length == 0) return; // no commits w/ modifications

        // scan items for installed items w/ modified paths
        for (let item of installed_named_items()) {
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
        }
      });
    });
}

// returns items that are installed and named (i.e. uniquely labeled)
const installed_named_items = () =>
  _labels((_, ids) => ids.length == 1)
    .map(_item)
    .filter((item) => item.attr);

// checks for updates to item, returning true iff updated
async function check_updates(item) {
  console.log(`checking for updates to ${item.name} ...`);
  const attr = item.attr;
  // use token used to install item, falling back to localStorage token, or no token
  const token = attr.token || localStorage.getItem("mindpage_github_token");
  const github = token ? new Octokit({ auth: token }) : new Octokit();
  try {
    // check for change to item
    const {
      data: [{ sha }],
    } = await github.repos.listCommits({
      ...attr,
      sha: attr.branch,
      per_page: 1,
    });
    if (sha != attr.sha) return true;

    // check for changes to embeds
    if (attr.embeds) {
      for (let embed of attr.embeds) {
        const {
          data: [{ sha }],
        } = await github.repos.listCommits({
          ...attr,
          path: embed.path,
          sha: attr.branch,
          per_page: 1,
        });
        if (sha != embed.sha) return true;
      }
    }
  } catch (e) {
    console.error(`failed to check for updates to ${item.name}: ` + e);
  }
  return false; // no updates
}

async function update_item(item) {
  console.log(`updating ${item.name} ...`);
  // TODO: model after /_update command
}
