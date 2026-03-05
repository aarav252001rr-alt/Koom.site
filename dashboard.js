let supabase;

document.addEventListener("DOMContentLoaded", init);

async function init() {

supabase = window.supabase.createClient(
SUPABASE_CONFIG.URL,
SUPABASE_CONFIG.ANON_KEY
);

const { data } = await supabase.auth.getSession();

if (!data.session) {
window.location.href = "login.html";
return;
}

loadLinks();
}



async function loadLinks() {

const { data, error } = await supabase
.from("links")
.select("*")
.order("createdat",{ascending:false});

if(error){
console.error(error);
return;
}

displayLinks(data);
}



function displayLinks(links){

const container=document.getElementById("linksContainer");

container.innerHTML="";

links.forEach(link=>{

const card=document.createElement("div");

card.className="link-card";

card.innerHTML=`

<h4>${link.shortcode}</h4>

<p>${link.longurl}</p>

<div>

<button onclick="copyLink('${link.shortcode}')">
Copy
</button>

<button onclick="deleteLink('${link.shortcode}')">
Delete
</button>

</div>

`;

container.appendChild(card);

});

}



async function saveLink(){

const longUrl=document.getElementById("modalLongUrl").value;

const alias=document.getElementById("modalCustomAlias").value;

if(!longUrl){
alert("Enter URL");
return;
}

const shortcode=alias || Math.random().toString(36).substring(2,8);

await supabase.from("links").insert({

shortcode:shortcode,
longurl:longUrl,
createdat:new Date()

});

closeModal();

loadLinks();

}



async function deleteLink(code){

if(!confirm("Delete link?")) return;

await supabase
.from("links")
.delete()
.eq("shortcode",code);

loadLinks();

}



function showCreateModal(){
document.getElementById("linkModal").style.display="block";
}

function closeModal(){
document.getElementById("linkModal").style.display="none";
}



function copyLink(code){

navigator.clipboard.writeText("https://koom.site/"+code);

alert("Copied");

}



async function logout(){

await supabase.auth.signOut();

window.location.href="login.html";

}
