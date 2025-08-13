# entities
## notebooks
a notebook is basically a group of indexed content

user can upload many files to a notebook and add a title

for example: systems design notebook
source files: systems-design-book.pdf, systems-design-video-url (youtube.com/...), systems-design-text-file.txt

the creation involves generating a vector index of this content, thats basically the notebook

# endpoints
## post /notebooks

create a new notebook

body:

```json
{
  "title": "some notebook name",
  "sources": [
    {
      "name": "systems-design-book.pdf",
      "type": "pdf",
      "content": "... pdf content",
    },
    {
      "name": "",
      "type": "youtube-video",
      "content": "https://youtube.com/watch?v=..."
    },
  ]
}
```

## post /notebooks/:notebook-id

queries to a notebook

body:

```json
{
  "question": "Whats this notebook about?"
}
```