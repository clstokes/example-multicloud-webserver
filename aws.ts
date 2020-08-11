import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as types from "./types";

export class Network extends types.Network {
    private readonly vpc: aws.ec2.Vpc;
    private readonly publicSubnets: aws.ec2.Subnet[];

    constructor(name: string, args: types.NetworkArgs, opts?: pulumi.ComponentResourceOptions) {
        super("custom:AwsNetwork", name, args, opts);

        const azs = aws.getAvailabilityZones({ state: "available" });

        this.vpc = new aws.ec2.Vpc(name, {
            cidrBlock: args.vpcCidrBlock,
        }, { parent: this });

        const internetGateway = new aws.ec2.InternetGateway(`${name}-public`, {
            vpcId: this.vpc.id,
            tags: { ...args.tags, Name: `${name}-public` },
        }, { parent: this.vpc });

        // Creat a Route Table for public subnets to use the Internet Gateway for 0.0.0.0/0 traffic.
        const publicSubnetRouteTable = new aws.ec2.RouteTable(`${name}-public`, {
            vpcId: this.vpc.id,
            tags: { ...args.tags, Name: `${name}-public` },
        }, { parent: this.vpc });
        const publicSubnetRoute = new aws.ec2.Route(`${name}-public`, {
            routeTableId: publicSubnetRouteTable.id,
            destinationCidrBlock: "0.0.0.0/0",
            gatewayId: internetGateway.id,
        }, { parent: publicSubnetRouteTable });

        this.publicSubnets = [];

        for (let i = 0; i < (args.publicSubnetCidrBlocks?.length ?? 0); i++) {
            const az = azs.then(it => it.zoneIds[i]);

            /**
             * Public Subnets
             */
            const publicSubnet = new aws.ec2.Subnet(`${name}-public-${i}`, {
                vpcId: this.vpc.id,
                availabilityZoneId: az,
                cidrBlock: args.publicSubnetCidrBlocks![i],
                mapPublicIpOnLaunch: true,
                tags: { ...args.tags, Name: `${name}-public-${i}` },
            }, {
                parent: this.vpc,
                deleteBeforeReplace: true,
            });
            this.publicSubnets.push(publicSubnet);

            const publicSubnetRouteTableAssociation = new aws.ec2.RouteTableAssociation(`${name}-public-${i}`, {
                subnetId: publicSubnet.id,
                routeTableId: publicSubnetRouteTable.id,
            }, { parent: publicSubnet });
        }

        this.registerOutputs();
    }

    public getNetworkId(): pulumi.Output<string> {
        return this.vpc.id;
    }
    public getPublicSubnetIds(): pulumi.Output<string>[] {
        return this.publicSubnets.map(it => it.id);
    }
}

export class WebServer extends types.WebServer {
    private readonly instance: aws.ec2.Instance;

    constructor(name: string, args: types.WebServerArgs, opts?: pulumi.ComponentResourceOptions) {
        super("custom:AwsWebServer", name, args, opts);

        const webSg = new aws.ec2.SecurityGroup(`${name}-webserver`, {
            vpcId: args.networkId,
            ingress: [{ protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] }],
            tags: { ...args.tags, Name: `${name}-webserver` },
        });

        const ubuntuAmiId = aws.getAmi({
            owners: ["099720109477"], // Ubuntu
            mostRecent: true,
            filters: [{ name: "name", values: ["ubuntu/images/hvm-ssd/ubuntu-focal-20.04-amd64-server-*"] },],
        }).then(it => it.id);

        this.instance = new aws.ec2.Instance(`${name}-webserver`, {
            ami: ubuntuAmiId,
            instanceType: aws.ec2.InstanceTypes.T3_Medium,
            subnetId: args.subnetId,
            vpcSecurityGroupIds: [webSg.id,],
            tags: { ...args.tags, Name: `${name}-webserver` },
        }, { parent: this, })

        this.registerOutputs();
    }

    public getInstanceId(): pulumi.Output<string> {
        return this.instance.id;
    }
    public getInstanceAddress(): pulumi.Output<string> {
        return this.instance.publicIp;
    }
}
