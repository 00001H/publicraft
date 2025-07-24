#include<cppp/string.hpp>
#include<cppp/bfile.hpp>
#include<iostream>
#include<csignal>
#include<cstdint>
#include<utility>
#include<format>
#include<bitset>
#include<vector>
#include<atomic>
#include<array>
#include<bit>
using namespace std::literals;
void normalize(cppp::sv s,cppp::str& out){
    for(char8_t c : s){
        if(c>=u8'A'&&c<=u8'Z'){
            c += (u8'a'-u8'A');
        }
        out.push_back(c);
    }
}
cppp::str uescape(cppp::sv s){
    constexpr static std::bitset<256uz> SAFE{"0000000000000000000000000000000000000000000001101111111111000000011111111111111111111111111000010111111111111111111111111110001000000000000000000000000000000000000000000000000000110000010000000000000000000000000000000000000000000000000000000000000000000000"s};
    constexpr static std::array<char8_t,16uz> TOHEX{u8'0',u8'1',u8'2',u8'3',u8'4',u8'5',u8'6',u8'7',u8'8',u8'9',u8'A',u8'B',u8'C',u8'D',u8'E',u8'F'};
    cppp::str out;
    for(char8_t c : s){
        if(SAFE[c]){
            out.push_back(c);
        }else{
            out.push_back(u8'%');
            out.push_back(TOHEX[c&15]);
            out.push_back(TOHEX[c>>4]);
        }
    }
    return out;
}
struct ItemData{
    cppp::str name;
    cppp::str normname;
    cppp::str icon;
    cppp::str discovered_by;
    bool operator==(const ItemData& other) const{
        return normname == other.normname;
    }
};
bool frdstr(cppp::BinaryFile& bf,cppp::str& s){
    std::uint64_t length{bf.readqle()};
    if(bf.eof()){return false;}
    s.resize(length);
    return bf.fread(cppp::buffer(reinterpret_cast<std::byte*>(s.data()),length));
}
void fwtstr(const cppp::str& s,cppp::BinaryFile& bf){
    bf.writeqle(s.size());
    bf.write(cppp::frozenbuffer(reinterpret_cast<const std::byte*>(s.data()),s.size()));
}
class ItemDB{
    std::vector<ItemData> db;
    cppp::BinaryFile file;
    public:
        ItemDB(std::filesystem::path dbf){
            if(std::filesystem::exists(dbf)){
                if(std::filesystem::is_directory(dbf)) throw std::runtime_error("Cannot create DB: directory exists with the same name");
                file.open(dbf,std::ios_base::in|std::ios_base::out|std::ios_base::binary);
                while(true){
                    ItemData& id = db.emplace_back();
                    if(!frdstr(file,id.name)){
                        db.pop_back();
                        break;
                    }
                    normalize(id.name,id.normname);
                    if(!frdstr(file,id.icon)) throw std::runtime_error("Error: truncated database entry");
                    if(!frdstr(file,id.discovered_by)) throw std::runtime_error("Error: truncated database entry");
                }
                file.errclr();
            }else{
                file.open(dbf,std::ios_base::out|std::ios_base::trunc|std::ios_base::binary);
            }
            // auto ue = std::ranges::begin(std::ranges::unique(db));
            // std::vector<ItemData> uniq{std::ranges::begin(db),ue};
            // file.close();
            // cppp::BinaryFile file2(dbf,std::ios_base::out|std::ios_base::trunc|std::ios_base::binary);
            // for(const ItemData& d : uniq){
            //     fwtstr(d.name,file2);
            //     fwtstr(d.icon,file2);
            //     fwtstr(d.discovered_by,file2);
            // }
            // file2.close();
        }
        void save(ItemData&& d){
            fwtstr(d.name,file);
            fwtstr(d.icon,file);
            fwtstr(d.discovered_by,file);
            file.flush();
            db.push_back(std::move(d));
        }
        const std::vector<ItemData>& data() const{
            return db;
        }
};
void rdstr(cppp::str& s){
    static_assert(std::endian::native==std::endian::little||std::endian::native==std::endian::big,"Mixed-endian system not supported");
    std::uint64_t length;
    std::cin.read(reinterpret_cast<char*>(&length),sizeof length); // must either succeed or throw
    if constexpr(std::endian::native == std::endian::big){
        length = std::byteswap(length);
    }
    s.resize(length);
    std::cin.read(reinterpret_cast<char*>(s.data()),length);
}
void wtstr(cppp::sv s){
    std::uint64_t length = s.size();
    if constexpr(std::endian::native == std::endian::big){
        length = std::byteswap(length);
    }
    std::cout.write(reinterpret_cast<const char*>(&length),sizeof length);
    std::cout.write(reinterpret_cast<const char*>(s.data()),s.size());
}
ItemDB items{u8"db/db.bin"sv};
std::atomic_bool interrupt{false};
extern "C" void interrupt_search(int){
    interrupt.store(true,std::memory_order_release);
}
int main(){
    std::signal(SIGINT,SIG_IGN);
    std::cin.exceptions(std::ios_base::failbit|std::ios_base::badbit|std::ios_base::eofbit);
    std::cout.exceptions(std::ios_base::failbit|std::ios_base::badbit);
    while(true){
        switch(std::char_traits<char>::to_char_type(std::cin.get())){
            case 'c': {
                ItemData d;
                rdstr(d.name);
                rdstr(d.icon);
                rdstr(d.discovered_by);
                normalize(d.name,d.normname);
                if(!std::ranges::contains(items.data(),d)){
                    items.save(std::move(d));
                }
                break;
            }
            case 'l': {
                interrupt.store(false,std::memory_order_release);
                std::signal(SIGHUP,interrupt_search);
                cppp::str lookup;
                rdstr(lookup);
                cppp::str normlookup;
                normalize(lookup,normlookup);
                for(const auto& d : items.data()){
                    if(d.normname.contains(normlookup)){
                        wtstr(d.name);
                        wtstr(d.icon);
                        wtstr(d.discovered_by);
                        std::cout.flush();
                    }
                    if(interrupt.load(std::memory_order_acquire)){
                        break;
                    }
                }
                wtstr(u8""sv);
                std::cout.flush();
                break;
            }
            case 'e': return 0;
            default:
                [[unlikely]] return -1;
        }
    }
    return 0;
}
