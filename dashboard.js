// Global variables
let supabase;
let currentEditCode = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard loaded');
    initSupabase();
    loadLinks();
    addDashboardStyles();
});

// Initialize Supabase
async function initSupabase() {
    if (!window.SUPABASE_CONFIG) {
        console.error('Supabase configuration not found!');
        showNotification('Configuration error! Please check console.', 'error');
        return;
    }

    try {
        supabase = window.supabase.createClient(
            window.SUPABASE_CONFIG.URL,
            window.SUPABASE_CONFIG.ANON_KEY
        );
        console.log('Supabase client initialized');
    } catch (error) {
        console.error('Error initializing Supabase:', error);
        showNotification('Error connecting to database', 'error');
    }
}

// API Helper
async function supabaseRequest(table, operation = 'select', data = null, query = null) {

    if (!supabase) await initSupabase()

    let result

    switch(operation){

        case "select":

            if(query){

                result = await supabase
                .from(table)
                .select("*")
                .eq(query.field,query.value)

            }else{

                result = await supabase
                .from(table)
                .select("*")
                .order("createdat",{ascending:false})

            }

        break


        case "insert":

            result = await supabase
            .from(table)
            .insert([data])
            .select()

        break


        case "update":

            result = await supabase
            .from(table)
            .update(data)
            .eq(query.field,query.value)
            .select()

        break


        case "delete":

            result = await supabase
            .from(table)
            .delete()
            .eq(query.field,query.value)

        break

    }

    if(result.error) throw result.error

    return result.data

}


// ADMIN + USER FILTER LOGIC
async function loadLinks(){

const user = JSON.parse(sessionStorage.getItem('user'))

try{

let links

if(user.role==="admin"){

links = await supabaseRequest(window.SUPABASE_CONFIG.TABLES.LINKS)

}else{

links = await supabaseRequest(
window.SUPABASE_CONFIG.TABLES.LINKS,
"select",
null,
{ field:"created_by", value:user.email }
)

}

if(links && links.length>0){

displayLinks(links)

}else{

document.getElementById("linksContainer").innerHTML='<p class="no-links">No links found.</p>'

}

}catch(error){

console.error("Error loading links:",error)

}

                  }
