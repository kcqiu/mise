import { DestinationCard } from "@/components/ui/card-21"; // Adjust the import path

const DestinationCardDemo = () => {
  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row items-center justify-center gap-8 md:gap-12 p-8 bg-background">
      <div className="w-full max-w-[320px] h-[450px]">
        <DestinationCard
          imageUrl="https://cdn.21st.dev/assets/mirror/76/76b04e380c8a1579e5047b5b26cf44addf4bac4b832d9c8cb5cad421ed653172.jpg"
          location="Indonesia"
          flag="????"
          stats="1,345 Hotels ? 24 Packages"
          href="#"
          // A deep, lush green HSL value
          themeColor="150 50% 25%" 
        />
      </div>
      <div className="w-full max-w-[320px] h-[450px]">
        <DestinationCard
          imageUrl="https://cdn.21st.dev/assets/mirror/83/8387e5a1a7f334327ef1f645f87f577c51162d52065a1b913c323c3f4e8e7960.jpg"
          location="Dubai"
          flag="????"
          stats="2,345 Hotels ? 54 Packages"
          href="#"
          // A rich, twilight purple HSL value
          themeColor="250 50% 30%"
        />
      </div>
    </div>
  );
};

export default DestinationCardDemo;
