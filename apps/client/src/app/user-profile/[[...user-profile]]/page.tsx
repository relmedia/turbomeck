import { UserProfile } from "@clerk/nextjs";

export default function UserProfilePage() {
  return (
    <div className="w-full flex justify-center py-8">
      <UserProfile
        routing="path"
        path="/user-profile"
        appearance={{
          elements: {
            rootBox: "w-full max-w-4xl",
          },
        }}
      />
    </div>
  );
}
