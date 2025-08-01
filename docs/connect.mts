const serverbox = document.getElementById("serverbox") as HTMLInputElement;
const statusmsg = document.getElementById("status") as HTMLLabelElement;
serverbox.addEventListener("keyup",async (e) => {
    if(e.key === "Enter"){
        const url = serverbox.value;
        try{
            const resp = await fetch(`${url}/ping`);
            const rtext = await resp.text();
            if(rtext === "OK"){
                localStorage.setItem("server",url);
                location.replace("./index.html");
            }else{
                throw new Error(`Unexpected server status response ${rtext}`);
            }
        }catch(e){
            statusmsg.textContent = `Server unreachable: ${e}`;
        }
    }
});
