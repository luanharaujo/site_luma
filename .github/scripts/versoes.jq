# Input: array of GitHub API release objects. Arg $parte: "treinos" or "adm".
# Output: tags of the usable releases of that part, oldest first.
# Usable = published (not draft), and its "<parte>.tar.gz" asset is fully uploaded.
# Order by published_at, then id. Never by created_at: the API sets it to the date
# of the tag's commit in this repo, so every release cut from the same main HEAD
# ties and the "newest" becomes whichever the list happens to return last.
[ .[]
  | select(.tag_name | startswith("parte-" + $parte + "-"))
  | select(.draft | not)
  | select(.published_at != null)
  | select(any(.assets[]?; .name == ($parte + ".tar.gz") and .state == "uploaded"))
]
| sort_by(.published_at, .id)
| .[].tag_name
