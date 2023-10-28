# xsshh

### Setup 
```
$ git clone 
$ cd xsshh
$ bun install
```
### Usage
```
$ bun run index.ts [filenames]
```
Example:
```
$ bun run index.ts samples/sample1.js samples/sample2.js
```

### Concept
Xsshh performs static analysis of the code to identify potentially attacker controlled sources that are flowing to vulnerable sinks


A source function is any JS property or function that accepts user input from somewhere on the page. An example of a source is the location.search property because it reads input from the query string.
They include 
```
document.URL
document.documentURI
document.URLUnencoded
document.baseURI
location.search
document.cookie
document.referrer
```

A sink is a potentially dangerous JavaScript function or gloabal object member that can cause undesirable effects if attacker controlled data is passed to it. Basically, if the function returns input back to the screen as output without security checks, it’s considered a sink. An example of this would be the “innerHTML” property as that changes the contents of the HTML page to whatever is given to it. The goal is to detect any attacker controlled sources being passed to sinks
They include
```
document.domain
document.innerHTNL
document.outerHTML
document.insertAdjacentHTML
document.onevent
```